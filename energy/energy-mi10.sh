#!/bin/sh
if [ "$#" -ne 1 ]; then
    echo "Illegal number of parameters" $#
    exit 0
fi
start_time=$(date +%s)
while true; do
    current_time=$(date +%s) 
    elapsed_time=$((current_time - start_time))  # 计算经过的时间，单位为秒
    if [ "$elapsed_time" -gt 60 ]; then  # 如果经过的时间大于60秒，则停止循环
        break
    fi
    usb_current=`cat /sys/class/power_supply/usb/input_current_now`
    usb_voltag=`cat /sys/class/power_supply/usb/voltage_now`
    batt_current=`cat /sys/class/power_supply/battery/current_now`
    batt_voltage=`cat /sys/class/power_supply/battery/voltage_now`
    echo "${usb_current},${usb_voltag},${batt_current},${batt_voltage}" >> $1
	usleep 100
done