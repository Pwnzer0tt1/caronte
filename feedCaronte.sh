#!/usr/bin/env bash

#	.		TIMEOUT    CARONTE_IP
#./caronte.sh 30 https://caronte.com game

if [[ "$#" -lt 3 ]]; then
	echo "Usage: $0 <timeout> <ip:port> <interface>"
	exit 2
fi

CURRENT_DIRECTORY=$(realpath $(dirname "$0"))
TMPFILE_SCRIPT="/tmp/caronte_upload_move_script_tmp.sh"
cd $CURRENT_DIRECTORY

UPLOAD_PROC=$$
THIS_PROC=$$

trap 'echo; kill -9 $UPLOAD_PROC; kill -9 $THIS_PROC' INT

TIMEOUT_TCPDUMP="$1"
CARONTE_ADDR="$2"
INTERFACE_NAME="$3"

mkdir upload 2> /dev/null

echo "#!/usr/bin/env bash
cd $CURRENT_DIRECTORY
mv \$1 upload/\$1 
" > $TMPFILE_SCRIPT
chmod +x $TMPFILE_SCRIPT

function upload_pcaps { 
  while true; do
    files=`ls ./upload/*.pcap 2> /dev/null`
    for file in $files
    do
      curl -F "file=@$file" -F "flush_all=false" "$CARONTE_ADDR/api/pcap/upload" && rm $file
      echo
    done
    sleep `echo $TIMEOUT_TCPDUMP/2 | bc`
  done
}

upload_pcaps & UPLOAD_PROC=$!

args=($@)
tcpdump -G $TIMEOUT_TCPDUMP -z $TMPFILE_SCRIPT -w capture-%Y%m%d-%H%M%S.pcap -i $INTERFACE_NAME ${args[@]:4:$(echo "$#")} 

