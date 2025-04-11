/*
 * This file is part of caronte (https://github.com/eciavatta/caronte).
 * Copyright (c) 2020 Emiliano Ciavatta.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import React, { Component } from "react";
import { withRouter } from "react-router-dom";
import classNames from "classnames";
import { 
  LineChart, Line, XAxis, YAxis, 
  ResponsiveContainer, Brush, Tooltip,
  ReferenceLine, ReferenceArea
} from 'recharts';
import { TimeRange, TimeSeries } from "pondjs";

import backend from "../backend";
import dispatcher from "../dispatcher";
import log from "../log";
import ChoiceField from "./fields/ChoiceField";
import "./Timeline.scss";

const minutes = 60 * 1000;
const maxTimelineRange = 24 * 60 * minutes;

const leftSelectionPaddingMultiplier = 24;
const rightSelectionPaddingMultiplier = 8;

class Timeline extends Component {
  state = {
    metric: "connections_per_service",
  };

  constructor() {
    super();

    this.disableTimeSeriesChanges = false;
    this.selectionTimeout = null;
    this.initialSelectionSet = false;
  }

  componentDidMount() {
    const urlParams = new URLSearchParams(this.props.location.search);
    this.setState({
      servicePortFilter: urlParams.get("service_port") || null,
      matchedRulesFilter: urlParams.getAll("matched_rules") || null,
    });

    this.loadStatistics(this.state.metric).then(() =>
      log.debug("Statistics loaded after mount")
    );
    dispatcher.register(
      "connections_filters",
      this.handleConnectionsFiltersCallback
    );
    dispatcher.register("connection_updates", this.handleConnectionUpdates);
    dispatcher.register("notifications", this.handleNotifications);

    // Add keyboard controls for the timeline
    document.addEventListener('keydown', this.handleKeyDown);

    // Listen for custom drag events
    window.addEventListener('timeline_drag', this.handleTimelineDrag);
  }

  componentWillUnmount() {
    dispatcher.unregister(this.handleConnectionsFiltersCallback);
    dispatcher.unregister(this.handleConnectionUpdates);
    dispatcher.unregister(this.handleNotifications);

    document.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('timeline_drag', this.handleTimelineDrag);

    // Cleanup any lingering handlers
    document.removeEventListener('mousemove', window.timelineHandleMouseMove);
    document.removeEventListener('mouseup', window.timelineHandleMouseUp);
  }

  loadStatistics = async (metric) => {
    const urlParams = new URLSearchParams();
    urlParams.set("metric", metric);

    let columns = [];
    if (metric === "matched_rules") {
      let rules = await this.loadRules();
      if (this.state.matchedRulesFilter.length > 0) {
        this.state.matchedRulesFilter.forEach((id) => {
          urlParams.append("rules_ids", id);
        });
        columns = this.state.matchedRulesFilter;
      } else {
        columns = rules.map((r) => r.id);
      }
    } else {
      let services = await this.loadServices();
      const filteredPort = this.state.servicePortFilter;
      if (filteredPort && services[filteredPort]) {
        const service = services[filteredPort];
        services = {};
        services[filteredPort] = service;
      }

      columns = Object.keys(services);
      columns.forEach((port) => urlParams.append("ports", port));
    }

    const metrics = (await backend.get("/api/statistics?" + urlParams)).json;
    if (metrics.length === 0) {
      return;
    }

    const zeroFilledMetrics = [];
    const toTime = (m) => new Date(m["range_start"]).getTime();

    let i;
    let timeStart = toTime(metrics[0]) - minutes;
    for (i = 0; timeStart < 0 && i < metrics.length; i++) {
      // workaround to remove negative timestamps :(
      timeStart = toTime(metrics[i]) - minutes;
    }

    let timeEnd = toTime(metrics[metrics.length - 1]) + minutes;
    if (timeEnd - timeStart > maxTimelineRange) {
      timeEnd = timeStart + maxTimelineRange;

      const now = new Date().getTime();
      if (
        !this.lastDisplayNotificationTime ||
        this.lastDisplayNotificationTime + minutes < now
      ) {
        this.lastDisplayNotificationTime = now;
        dispatcher.dispatch("notifications", { event: "timeline.range.large" });
      }
    }

    for (let interval = timeStart; interval <= timeEnd; interval += minutes) {
      if (i < metrics.length && interval === toTime(metrics[i])) {
        const m = metrics[i++];
        m["range_start"] = new Date(m["range_start"]);
        zeroFilledMetrics.push(m);
      } else {
        const m = {};
        m["range_start"] = new Date(interval);
        m[metric] = {};
        columns.forEach((c) => (m[metric][c] = 0));
        zeroFilledMetrics.push(m);
      }
    }

    const series = new TimeSeries({
      name: "statistics",
      columns: ["time"].concat(columns),
      points: zeroFilledMetrics.map((m) =>
        [m["range_start"]].concat(
          columns.map((c) =>
            metric in m && m[metric] != null ? m[metric][c] || 0 : 0
          )
        )
      ),
    });

    const start = series.range().begin();
    const end = series.range().end();

    let initialSelection = this.state.selection;
    if (!this.initialSelectionSet && series.size() > 2) {
      const lastIndex = series.size() - 1;
      const preLastIndex = Math.max(0, lastIndex - 10);
      initialSelection = new TimeRange(
        series.at(preLastIndex).timestamp(),
        series.at(lastIndex).timestamp()
      );
      this.initialSelectionSet = true;
    }

    this.setState({
      metric,
      series,
      timeRange: new TimeRange(start, end),
      columns,
      start,
      end,
      selection: initialSelection,
    });
  };

  loadServices = async () => {
    const services = (await backend.get("/api/services")).json;
    this.setState({ services });
    return services;
  };

  loadRules = async () => {
    const rules = (await backend.get("/api/rules")).json;
    this.setState({ rules });
    return rules;
  };

  createStyler = () => {
    const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#0088fe', '#00C49F'];
    if (this.state.metric === "matched_rules") {
      if (!this.state.rules) return [];
      return this.state.rules.map((rule, index) => {
        return { 
          dataKey: rule.id, 
          color: rule.color || colors[index % colors.length],
          strokeWidth: 2 
        };
      });
    } else {
      if (!this.state.services) return [];
      return Object.keys(this.state.services).map((port, index) => {
        return {
          dataKey: port,
          color: this.state.services[port].color || colors[index % colors.length],
          strokeWidth: 2
        };
      });
    }
  };

  formatTimeSeriesForRecharts = () => {
    if (!this.state.series) return [];
    
    const series = this.state.series;
    const columns = this.state.columns || [];
    const result = [];
    
    // Convert TimeSeries data to recharts format
    for (let i = 0; i < series.size(); i++) {
      const event = series.at(i);
      const time = event.timestamp().getTime();
      const point = { time: new Date(time) };
      
      columns.forEach(col => {
        point[col] = event.get(col);
      });
      
      result.push(point);
    }
    
    return result;
  };

  handleTimeRangeChange = (timeRange) => {
    if (!this.disableTimeSeriesChanges) {
      this.setState({ timeRange });
    }
  };

  handleSelectionChange = (timeRange) => {
    this.disableTimeSeriesChanges = true;

    this.setState({ selection: timeRange });
    if (this.selectionTimeout) {
      clearTimeout(this.selectionTimeout);
    }
    this.selectionTimeout = setTimeout(() => {
      log.debug(`Selection: ${timeRange.begin().toISOString()} to ${timeRange.end().toISOString()}`);
      dispatcher.dispatch("timeline_updates", {
        from: timeRange.begin(),
        to: timeRange.end(),
      });
      this.selectionTimeout = null;
      this.disableTimeSeriesChanges = false;
    }, 1000);
  };

  handleConnectionsFiltersCallback = (payload) => {
    if (
      "service_port" in payload &&
      this.state.servicePortFilter !== payload["service_port"]
    ) {
      this.setState({ servicePortFilter: payload["service_port"] });
      this.loadStatistics(this.state.metric).then(() =>
        log.debug("Statistics reloaded after service port changed")
      );
    }
    if (
      "matched_rules" in payload &&
      this.state.matchedRulesFilter !== payload["matched_rules"]
    ) {
      this.setState({ matchedRulesFilter: payload["matched_rules"] });
      this.loadStatistics(this.state.metric).then(() =>
        log.debug("Statistics reloaded after matched rules changed")
      );
    }
  };

  handleConnectionUpdates = (payload) => {
    if (
      payload.from >= this.state.start &&
      payload.from < payload.to &&
      payload.to <= this.state.end
    ) {
      this.setState({
        selection: new TimeRange(payload.from, payload.to),
      });
      this.adjustSelection();
    }
  };

  handleNotifications = (payload) => {
    if (
      payload.event === "services.edit" &&
      this.state.metric !== "matched_rules"
    ) {
      this.loadStatistics(this.state.metric).then(() =>
        log.debug("Statistics reloaded after services updates")
      );
    } else if (
      payload.event.startsWith("rules") &&
      this.state.metric === "matched_rules"
    ) {
      this.loadStatistics(this.state.metric).then(() =>
        log.debug("Statistics reloaded after rules updates")
      );
    } else if (payload.event === "pcap.completed") {
      this.loadStatistics(this.state.metric).then(() =>
        log.debug("Statistics reloaded after pcap processed")
      );
    }
  };

  adjustSelection = () => {
    const seriesRange = this.state.series.range();
    const selection = this.state.selection;
    const delta = selection.end() - selection.begin();
    const start = Math.max(
      selection.begin().getTime() - delta * leftSelectionPaddingMultiplier,
      seriesRange.begin().getTime()
    );
    const end = Math.min(
      selection.end().getTime() + delta * rightSelectionPaddingMultiplier,
      seriesRange.end().getTime()
    );
    this.setState({ timeRange: new TimeRange(start, end) });
  };

  aggregateSeries = (func) => {
    const values = this.state.series
      .columns()
      .map((c) => this.state.series[func](c));
    return Math[func](...values);
  };

  handleChartClick = (e) => {
    if (!e || !this.state.series || !e.activeLabel) return;
    
    const clickedTime = new Date(e.activeLabel);
    if (this.state.selection) {
      this.handleSelectionChange(new TimeRange(clickedTime, 
        new Date(clickedTime.getTime() + 10 * minutes)));
    }
  };

  handleTimelineDrag = (e) => {
    if (!this.state.selection) return;
    
    const { movePercent } = e.detail;
    const totalTime = this.state.end.getTime() - this.state.start.getTime();
    const moveTime = totalTime * movePercent;
    
    const selectionDuration = this.state.selection.end().getTime() - 
      this.state.selection.begin().getTime();
    
    let newStart = new Date(this.state.selection.begin().getTime() + moveTime);
    let newEnd = new Date(newStart.getTime() + selectionDuration);
    
    // Keep selection within bounds
    if (newStart < this.state.start) {
      newStart = this.state.start;
      newEnd = new Date(newStart.getTime() + selectionDuration);
    }
    
    if (newEnd > this.state.end) {
      newEnd = this.state.end;
      newStart = new Date(newEnd.getTime() - selectionDuration);
    }
    
    this.handleSelectionChange(new TimeRange(newStart, newEnd));
  }

  handleKeyDown = (e) => {
    if (!this.state.selection) return;
    
    const selection = this.state.selection;
    const selectionDuration = selection.end().getTime() - selection.begin().getTime();
    let newStart = selection.begin();
    let newEnd = selection.end();
    
    // Amount to move (10% of current selection width)
    const moveAmount = selectionDuration * 0.1;
    
    switch (e.key) {
      case 'ArrowLeft':
        if (e.shiftKey) {
          // Shrink from right
          newEnd = new Date(Math.max(
            newStart.getTime() + minutes,
            newEnd.getTime() - moveAmount
          ));
        } else {
          // Move left
          newStart = new Date(Math.max(
            this.state.start.getTime(),
            newStart.getTime() - moveAmount
          ));
          newEnd = new Date(newStart.getTime() + selectionDuration);
        }
        break;
        
      case 'ArrowRight':
        if (e.shiftKey) {
          // Expand to right
          newEnd = new Date(Math.min(
            this.state.end.getTime(),
            newEnd.getTime() + moveAmount
          ));
        } else {
          // Move right
          newEnd = new Date(Math.min(
            this.state.end.getTime(),
            newEnd.getTime() + moveAmount
          ));
          newStart = new Date(newEnd.getTime() - selectionDuration);
        }
        break;
    }
    
    if (newStart.getTime() !== selection.begin().getTime() || 
        newEnd.getTime() !== selection.end().getTime()) {
      this.handleSelectionChange(new TimeRange(newStart, newEnd));
      e.preventDefault();
    }
  }

  render() {
    if (!this.state.series) {
      return <footer className="footer"><div className="time-line">Loading timeline data...</div></footer>;
    }

    const chartData = this.formatTimeSeriesForRecharts();
    const lines = this.createStyler();
    
    const selection = this.state.selection;
    const selectionStart = selection ? selection.begin().getTime() : null;
    const selectionEnd = selection ? selection.end().getTime() : null;

    let startIndex = 0;
    let endIndex = chartData.length - 1;
    
    if (selection && chartData.length > 0) {
      const startTime = selection.begin().getTime();
      const endTime = selection.end().getTime();
      
      startIndex = Math.max(0, chartData.findIndex(point => 
        point.time.getTime() >= startTime));
      
      if (startIndex === -1) startIndex = 0;
      
      const foundEndIndex = chartData.findIndex(point => 
        point.time.getTime() >= endTime);
      
      endIndex = foundEndIndex !== -1 ? foundEndIndex : chartData.length - 1;
    } else if (chartData.length > 10) {
      startIndex = chartData.length - 10;
      endIndex = chartData.length - 1;
    }

    return (
      <footer className="footer">
        <div
          className={classNames("time-line")}
          style={{ minHeight: '150px', cursor: 'pointer' }}
        >
          {!chartData || chartData.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: '50px' }}>
              No timeline data available. Try changing filters or metrics.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={this.props.height || 200}>
              <LineChart
                data={chartData}
                margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
                onClick={this.handleChartClick}
              >
                <XAxis 
                  dataKey="time" 
                  type="date"
                  scale="time"
                  domain={['auto', 'auto']}
                  tickFormatter={(time) => new Date(time).toLocaleTimeString()}
                  height={30}
                />
                <YAxis width={40} />
                <Tooltip
                  labelFormatter={(time) => new Date(time).toLocaleString()}
                  contentStyle={{
                    backgroundColor: '#333',
                    border: 'none',
                    borderRadius: '4px',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)'
                  }}
                  itemStyle={{ color: '#fff' }}
                  labelStyle={{ color: '#fff', fontWeight: 'bold', marginBottom: '5px' }}
                  formatter={(value, name) => [`${value} ${name}`, '']}
                  cursor={{ stroke: '#666', strokeWidth: 1 }}
                  content={(props) => {
                    if (!props.active || !props.payload || props.payload.length === 0) {
                      return null;
                    }
                    
                    const getMetricLabel = (metric) => {
                      const metricLabels = {
                        'connections_per_service': 'Connections',
                        'client_bytes_per_service': 'Client Bytes',
                        'server_bytes_per_service': 'Server Bytes',
                        'duration_per_service': 'Duration',
                        'matched_rules': 'Rule'
                      };
                      return metricLabels[this.state.metric] || 'Value';
                    };
                    
                    return (
                      <div style={{
                        backgroundColor: '#333',
                        padding: '10px',
                        border: 'none',
                        borderRadius: '4px',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
                        color: 'white'
                      }}>
                        <p style={{ margin: '0 0 8px 0', fontWeight: 'bold' }}>
                          {new Date(props.label).toLocaleString()}
                        </p>
                        {props.payload.map((entry, index) => (
                          <div key={index} style={{ 
                            display: 'flex',
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            marginBottom: index < props.payload.length - 1 ? '5px' : 0
                          }}>
                            <span style={{ 
                              display: 'inline-block', 
                              width: '10px', 
                              height: '10px', 
                              backgroundColor: entry.color,
                              marginRight: '5px'
                            }}></span>
                            <span style={{ marginRight: '10px' }}>{entry.dataKey}:</span>
                            <span style={{ fontWeight: 'bold' }}>
                              {entry.value} {getMetricLabel(this.state.metric)}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                
                {selectionStart && selectionEnd && (
                  <ReferenceArea
                    x1={new Date(selectionStart)}
                    x2={new Date(selectionEnd)}
                    strokeOpacity={0.5}
                    fill="#8884d8"
                    fillOpacity={0.2}
                    strokeWidth={1}
                  />
                )}
                
                {lines.map((line, index) => (
                  <Line
                    key={index}
                    type="monotone"
                    dataKey={line.dataKey}
                    stroke={line.color}
                    strokeWidth={line.strokeWidth + 1}
                    dot={false}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                  />
                ))}
                
                <Brush
                  dataKey="time"
                  height={40}
                  stroke="#8884d8"
                  strokeWidth={2}
                  fill="rgba(136, 132, 216, 0.3)"
                  travellerWidth={10}
                  travellerStroke="#6450b8"
                  travellerStrokeWidth={2}
                  travellerFill="#fff"
                  startIndex={startIndex}
                  endIndex={endIndex}
                  onChange={(brushData) => {
                    if (brushData.startIndex !== undefined && 
                        brushData.endIndex !== undefined &&
                        chartData[brushData.startIndex] && 
                        chartData[brushData.endIndex]) {
                      
                      const startTime = chartData[brushData.startIndex].time;
                      const endTime = chartData[brushData.endIndex].time;
                      
                      if (this.selectionTimeout) {
                        clearTimeout(this.selectionTimeout);
                      }
                      this.selectionTimeout = setTimeout(() => {
                        this.handleSelectionChange(new TimeRange(startTime, endTime));
                        this.selectionTimeout = null;
                      }, 150);
                      
                    }
                  }}
                  
                />
              </LineChart>
            </ResponsiveContainer>
          )}

          <div className="metric-selection">            
            <ChoiceField
              inline
              small
              keys={[
                "connections_per_service",
                "client_bytes_per_service",
                "server_bytes_per_service",
                "duration_per_service",
                "matched_rules",
              ]}
              values={[
                "Connections by Service",
                "Client Bytes by Service",
                "Server Bytes by Service",
                "Duration by Service",
                "Matched Rules",
              ]}
              onChange={(metric) =>
                this.loadStatistics(metric).then(() =>
                  log.debug("Statistics loaded after metric changes")
                ).catch(err => {
                  log.error("Failed to load statistics:", err);
                })
              }
              value={this.state.metric}
            />
          </div>
        </div>
      </footer>
    );
  }
}

export default withRouter(Timeline);
