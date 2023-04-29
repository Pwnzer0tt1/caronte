#!/usr/bin/env bash

#	.		TIMEOUT    CARONTE_IP
#./caronte.sh 30 https://caronte.com game

if [[ "$#" -ne 3 ]]; then
	echo "Usage: ./caronte.sh <timeout> <ip:port> <interface>"
	exit 2
fi

PROC_TIMEOUT=$$
UPLOAD_PROC=$$
THIS_PROC=$$

trap 'echo; kill -9 $PROC_TIMEOUT; kill -9 $UPLOAD_PROC; kill -9 $THIS_PROC' INT

TIMEOUT_TCPDUMP="$1"
CARONTE_ADDR="$2"
INTERFACE_NAME="$3"

mkdir upload 2> /dev/null

function get_pcaps {
  while true; do
	  timeout $TIMEOUT_TCPDUMP tcpdump -w "data.pcap" -i $INTERFACE_NAME port not 22 and port not 4444 &> /dev/null & PROC_TIMEOUT=$!
    wait $PROC_TIMEOUT
    mv data.pcap "upload/data-$(md5sum <<< date | awk '{ print $1 }').pcap"
  done
}

function upload_pcaps { 
  while true; do
    files=`ls ./upload/*.pcap 2> /dev/null`
    for file in $files
    do
      curl -F "file=@$file" -F "flush_all=true" "$CARONTE_ADDR/api/pcap/upload" && rm $file
      echo
    done
    sleep `echo $TIMEOUT_TCPDUMP/2 | bc`
  done
}

upload_pcaps & UPLOAD_PROC=$!

get_pcaps

