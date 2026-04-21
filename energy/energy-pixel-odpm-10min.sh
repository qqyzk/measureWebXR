#!/bin/bash
if [ "$#" -ne 1 ]; then
    echo "Usage: ./energy-pixel-odpm-10min.sh <output-name>"
    echo "Example: ./energy-pixel-odpm-10min.sh three-4096-10min"
    exit 1
fi

adb shell perfetto \
  -c - --txt \
  -o /data/misc/perfetto-traces/$1\
<<EOF

buffers: {
    size_kb: 129024
    fill_policy: DISCARD
}
buffers: {
    size_kb: 2048
    fill_policy: DISCARD
}
data_sources: {
    config {
        name: "android.packages_list"
        target_buffer: 1
    }
}
data_sources: {
    config {
        name: "android.power"
        android_power_config {
            battery_poll_ms: 250
            battery_counters: BATTERY_COUNTER_CAPACITY_PERCENT
            battery_counters: BATTERY_COUNTER_CHARGE
            battery_counters: BATTERY_COUNTER_CURRENT
            collect_power_rails: true
        }
    }
}
duration_ms: 600000

EOF

echo "Trace saved to /data/misc/perfetto-traces/$1"
echo "Run: adb pull /data/misc/perfetto-traces/$1 ./"
