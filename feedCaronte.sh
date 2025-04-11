#!/usr/bin/env bash

#	     TIMEOUT    CARONTE_IP
#./caronte.sh 30 https://caronte.com 

if [[ "$#" -lt 2 ]]; then
	echo "Usage: $0 <timeout> <ip:port> <tcpdump_command...>"
	exit 2
fi

CURRENT_DIRECTORY=$(realpath $(dirname "$0"))
cd $CURRENT_DIRECTORY

UPLOAD_PROC=$$
THIS_PROC=$$


TIMEOUT_TCPDUMP="$1"
CARONTE_ADDR="$2"

mkdir /tmp/upload 2> /dev/null
chmod 777 /tmp/upload &> /dev/null

function upload_pcaps { 
  while true; do
    file=`ls /tmp/upload/*.pcap 2> /dev/null`; file=($file); file=${file[1]} #Take the file that has finised to be written
    echo $file;
    if [ -z "$file" ]
    then
        sleep `echo $TIMEOUT_TCPDUMP/2 | bc`
    else
        curl -F "file=@$file" -F "flush_all=false" "$CARONTE_ADDR/api/pcap/upload" && rm $file
    fi
  done
}

upload_pcaps & UPLOAD_PROC=$!

trap 'echo; kill -9 $UPLOAD_PROC; kill -9 $THIS_PROC' INT

args=($@)
exec tcpdump -G $TIMEOUT_TCPDUMP -w /tmp/upload/capture-%Y%m%d-%H%M%S.pcap ${args[@]:2:$(echo "$#")} 
