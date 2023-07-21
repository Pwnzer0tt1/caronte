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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import React, {Component} from "react";
import {Col, Container, Row} from "react-bootstrap";
import backend from "../../backend";
import {createCurlCommand} from "../../utils";
import validation from "../../validation";
import ButtonField from "../fields/ButtonField";
import InputField from "../fields/InputField";
import TextField from "../fields/TextField";
import Header from "../Header";
import LinkPopover from "../objects/LinkPopover";
import "../panels/common.scss";
import "./ConfigurationPage.scss";

class ConfigurationPage extends Component {

    constructor(props) {
        super(props);
        this.state = {
            settings: {
                "config": {
                    "server_address": "",
                    "flag_regex": "",
                },
            },
            newUsername: "",
            newPassword: ""
        };
    }

    saveSettings = () => {
        if (this.validateSettings(this.state.settings)) {
            backend.post("/setup", this.state.settings).then((_) => {
                this.props.onConfigured();
            }).catch((res) => {
                this.setState({setupStatusCode: res.status, setupResponse: JSON.stringify(res.json)});
            });
        }
    };

    validateSettings = (settings) => {
        let valid = true;
        if (!validation.isValidAddress(settings.config["server_address"], true)) {
            this.setState({serverAddressError: "invalid ip_address"});
            valid = false;
        }
        if (settings.config["flag_regex"].length == 0) {
            this.setState({flagRegexError: "flag_regex.length == 0"});
            valid = false;
        }

        return valid;
    };

    updateParam = (callback) => {
        callback(this.state.settings);
        this.setState({settings: this.state.settings});
    };

    render() {
        const settings = this.state.settings;
        const curlCommand = createCurlCommand("/setup", "POST", settings);

        return (
            <div className="page configuration-page">
                <div className="page-header">
                    <Header />
                </div>

                <div className="page-content">
                    <div className="pane-container configuration-pane">
                        <div className="pane-section" style={{minWidth:"60vw"}}>
                            <div className="section-header">
                                <span className="api-request">POST /setup</span>
                                <span className="api-response"><LinkPopover text={this.state.setupStatusCode}
                                                                            content={this.state.setupResponse}
                                                                            placement="left"/></span>
                            </div>

                            <div className="section-content">
                                <Container className="p-0">
                                    <Row>
                                        <Col>
                                            <InputField name="server_address" value={settings.config["server_address"]}
                                                        error={this.state.serverAddressError}
                                                        onChange={(v) => this.updateParam((s) => s.config["server_address"] = v)}/>
                                            <InputField name="flag_regex" value={settings.config["flag_regex"]}
                                                        onChange={(v) => this.updateParam((s) => s.config["flag_regex"] = v)}
                                                        error={this.state.flagRegexError}/>

                                        </Col>

                                    </Row>
                                </Container>

                                <TextField value={curlCommand} rows={4} readonly small={true}/>
                            </div>

                            <div className="section-footer">
                                <ButtonField variant="green" name="save" bordered onClick={this.saveSettings}/>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

export default ConfigurationPage;
