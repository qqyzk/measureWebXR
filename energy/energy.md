# Energy

##### 路径

/data/local/tmp

##### 文件传输

```
adb push <本地文件路径> <设备目标路径>
adb pull <设备文件路径> <本地目标路径>

```

##### 实例文件

N开头那几个应该对应的是energy.sh测出来的，带pid的

##### 电压电流

```
 usb_current=`cat /sys/class/power_supply/usb/input_current_now`
 usb_voltag=`cat /sys/class/power_supply/usb/voltage_now`
 batt_current=`cat /sys/class/power_supply/battery/current_now`
 batt_voltage=`cat /sys/class/power_supply/battery/voltage_now`
```

```
powers = []
    for i in range(len(usb_current)):
        power = (np.mean(usb_current[i]) * np.mean(usb_voltage[i]) + np.mean(batt_current[i]) * np.mean(batt_voltage[i])) / 1e12
        powers.append(power)
```

计算方式应该是二者相加

