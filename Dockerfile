#Build backend with go
FROM debian:sid-slim AS BACKEND_BUILDER
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -qq curl golang-go

#Install tools and libraries
RUN DEBIAN_FRONTEND=noninteractive apt-get install -qq \
	git \
	pkg-config \
	libpcap-dev \
	libvectorscan-dev

WORKDIR /caronte

COPY . ./

RUN export VERSION=$(git describe --tags --abbrev=0)
RUN go mod download
RUN go build -ldflags "-X main.Version=$VERSION"
RUN mkdir -p build 
RUN cp -r caronte pcaps/ scripts/ shared/ test_data/ build/


# Build frontend via yarn
FROM node:16 as FRONTEND_BUILDER

WORKDIR /caronte-frontend

COPY ./frontend ./

RUN yarn install && yarn build --production=true


# LAST STAGE
FROM debian:sid-slim
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -qq curl golang-go

COPY --from=BACKEND_BUILDER /caronte/build /opt/caronte
COPY --from=FRONTEND_BUILDER /caronte-frontend/build /opt/caronte/frontend/build

RUN apt-get update && \
	DEBIAN_FRONTEND=noninteractive apt-get install -qq \
	libpcap-dev \
	libvectorscan-dev &&\
  rm -rf /var/lib/apt/lists/*

ENV GIN_MODE release

ENV MONGO_HOST mongo

ENV MONGO_PORT 27017

WORKDIR /opt/caronte

ENTRYPOINT ./caronte -mongo-host ${MONGO_HOST} -mongo-port ${MONGO_PORT} -assembly_memuse_log
