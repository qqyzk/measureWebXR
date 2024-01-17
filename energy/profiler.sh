for  i in {1…20}
do
    $('cat /sys/class/kgsl/kgsl-3d0/gpu_busy_percentage >> /data/local/tmp/gpu_info')
done