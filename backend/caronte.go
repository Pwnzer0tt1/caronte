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

import (
	"flag"
	"fmt"
	"os"

	"github.com/rs/zerolog"
	log "github.com/rs/zerolog/log"
)

var Version string

var (
	mongoHost   = flag.String("mongo-host", "localhost", "address of MongoDB")
	mongoPort   = flag.Int("mongo-port", 27017, "port of MongoDB")
	dbName      = flag.String("db-name", "caronte", "name of database to use")
	bindAddress = flag.String("bind-address", "0.0.0.0", "address where server is bind")
	bindPort    = flag.Int("bind-port", 3333, "port where server is bind")
)

func main() {

	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})

	flag.Parse()

	log.Debug().Msg("starting caronte")

	log.Debug().Str("host", *mongoHost).Int("port", *mongoPort).Str("dbName", *dbName).
		Msg("connecting to MongoDB")
	storage, err := NewMongoStorage(*mongoHost, *mongoPort, *dbName)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to MongoDB")
	}

	if Version == "" {
		Version = "undefined"
	}

	log.Debug().Msg("creating application context")
	applicationContext, err := CreateApplicationContext(storage, Version)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to create application context")
	}
	log.Debug().Msg("application context created")

	log.Debug().Msg("creating notification controller")
	notificationController := NewNotificationController(applicationContext)
	go notificationController.Run()
	applicationContext.SetNotificationController(notificationController)
	log.Debug().Msg("notification controller created")

	log.Debug().Msg("creating resources controller")
	resourcesController := NewResourcesController(notificationController)
	go resourcesController.Run()
	log.Debug().Msg("resources controller created")

	log.Debug().Msg("creating application router")
	applicationContext.Configure()
	applicationRouter := CreateApplicationRouter(applicationContext, notificationController, resourcesController)
	log.Debug().Msg("application router created")

	log.Debug().Msg("starting server")
	err = applicationRouter.Run(fmt.Sprintf("%s:%v", *bindAddress, *bindPort))
	if err != nil {
		log.Fatal().Err(err).Msg("failed to create the server")
	}
}
