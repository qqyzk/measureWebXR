from perfetto.trace_processor import TraceProcessor, TraceProcessorConfig

# 创建 TraceProcessorConfig 对象并设置 verbose=True
config = TraceProcessorConfig(verbose=True,bin_path='/Users/biweichen/Documents/expandEnergy/measureWebXR/energy/trace_processor')

# 初始化 TraceProcessor 对象时传入配置对象
tp = TraceProcessor(trace='/Users/biweichen/Documents/expandEnergy/measureWebXR/energy/refers/trace',config=config)


