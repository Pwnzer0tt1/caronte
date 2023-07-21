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

package main

import "errors"


type Config struct {
	ServerAddress string `json:"server_address" binding:"required,ip|cidr" bson:"server_address"`
	FlagRegex     string `json:"flag_regex" binding:"required,min=1" bson:"flag_regex"`
}

type ApplicationContext struct {
	Storage                     Storage
	Config                      Config
	RulesManager                RulesManager
	PcapImporter                *PcapImporter
	ConnectionsController       ConnectionsController
	ServicesController          *ServicesController
	ConnectionStreamsController ConnectionStreamsController
	SearchController            *SearchController
	StatisticsController        StatisticsController
	NotificationController      *NotificationController
	IsConfigured                bool
	Version                     string
}

func CreateApplicationContext(storage Storage, version string) (*ApplicationContext, error) {
	var configWrapper struct {
		Config Config
	}

	if err := storage.Find(Settings).Filter(OrderedDocument{{"_id", "config"}}).
		First(&configWrapper); err != nil {
		return nil, err
	}

	applicationContext := &ApplicationContext{
		Storage:                storage,
		Config:                 configWrapper.Config,
		Version:                version,
	}

	return applicationContext, nil
}

func (sm *ApplicationContext) SetConfig(config Config) (error) {
	sm.Config = config
  err := sm.Configure()
  if err != nil { return err }
	var upsertResults interface{}
	if _, err := sm.Storage.Update(Settings).Upsert(&upsertResults).
		Filter(OrderedDocument{{"_id", "config"}}).One(UnorderedDocument{"config": config}); err != nil {
		return err
	}
  return nil
}

func (sm *ApplicationContext) SetNotificationController(notificationController *NotificationController) {
	sm.NotificationController = notificationController
}

func (sm *ApplicationContext) Configure() (error) {
	if sm.IsConfigured {
		return errors.New("Not configured yet")
	}
	if sm.Config.ServerAddress == "" || sm.Config.FlagRegex == "" {
		return errors.New("Server Ip or Flag Regex not set")
	}
	serverNet := ParseIPNet(sm.Config.ServerAddress)
	if serverNet == nil {
		return errors.New("Invalid server address")
	}

	rulesManager, err := LoadRulesManager(sm.Storage, sm.Config.FlagRegex)
	if err != nil {
		return err
	}
	sm.RulesManager = rulesManager
	sm.PcapImporter = NewPcapImporter(sm.Storage, *serverNet, sm.RulesManager, sm.NotificationController)
	sm.ServicesController = NewServicesController(sm.Storage)
	sm.SearchController = NewSearchController(sm.Storage)
	sm.ConnectionsController = NewConnectionsController(sm.Storage, sm.SearchController, sm.ServicesController)
	sm.ConnectionStreamsController = NewConnectionStreamsController(sm.Storage)
	sm.StatisticsController = NewStatisticsController(sm.Storage)
	sm.IsConfigured = true
	return nil
}
