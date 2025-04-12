#Build backend with go
FROM debian:trixie-slim AS backend_builder
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -qq curl golang-go

#Install tools and libraries
RUN DEBIAN_FRONTEND=noninteractive apt-get install -qq \
	git pkg-config \
	libpcap-dev libvectorscan-dev

WORKDIR /caronte
COPY ./backend/ ./
RUN export VERSION=$(git describe --tags --abbrev=0)
RUN go mod download
RUN go build -ldflags "-X main.Version=$VERSION"
RUN mkdir -p build 
RUN cp -r caronte pcaps/ scripts/ shared/ build/

# Build frontend via yarn
FROM oven/bun AS frontend_builder
WORKDIR /caronte-frontend
COPY ./frontend ./
RUN bun install
RUN bun run build

# LAST STAGE
FROM debian:trixie-slim
COPY --from=backend_builder /caronte/build /opt/caronte
COPY --from=frontend_builder /caronte-frontend/dist /opt/caronte/frontend/dist
RUN apt-get update && \
	DEBIAN_FRONTEND=noninteractive apt-get install -qq libpcap-dev libvectorscan-dev &&\
  rm -rf /var/lib/apt/lists/*

ENV GIN_MODE=release
WORKDIR /opt/caronte
CMD ["./caronte", "-mongo-host", "mongo", "-mongo-port", "27017", "-assembly_memuse_log"]
