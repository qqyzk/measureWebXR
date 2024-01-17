const fs = require('fs');
let clickStart=null, networkStart=null, networkEnd=null;
let usages = [], times = [];
let path = '../data/localhost-recording.json';
const jsonData = fs.readFileSync(path);
const data = JSON.parse(jsonData);
if(!'recording' in data){
    console.log('Wrong Data Format');
    process.exit();
}
let recording = data['recording'];
if(!'records' in recording){
    console.log('Wrong Data Format');
    process.exit();
}
records = recording['records'];
for(let i=0;i<records.length;i++){
    let record = records[i];
    if(record['type']==='timeline-record-type-script' && record['details']==='click'){
        clickStart = record['startTime'];
    }
    if(record['type']==='timeline-record-type-network'){
        let entry = record['entry'];
        let start = entry['time'];
        let timings = entry['timings'];
        let duration=0;
        for(const key in timings){
            let value = timings[key];
            if(value>0){
                duration+=value;
            }
        }
        let end = start+duration;
        if(networkStart===null || start<networkStart){
            networkStart = start;
        }
        if(networkEnd===null || end>networkEnd){
            networkEnd = end;
        }
        
    }
    if(record['type']==='timeline-record-type-cpu'){
        let time = record['timestamp'];
        let threads = record['threads'];
        for(let j=0;j<threads.length;j++){
            let thread = threads[j];
            if(thread['name']!=='Main Thread'){
                continue;
            }
            let usage = thread['usage'];
            usages.push(usage);
            times.push(time);
        }
    }
}
console.log('click:',clickStart,'ms','networkStart:',networkStart,'ms','networkEnd:',networkEnd, 'ms');
// const fs2 = require('fs');



fs.writeFile('../data/usage.txt', usages.toString(), err => {
  if (err) {
    console.error(err);
    return;
  }
  console.log('写入成功');
});
fs.writeFile('../data/time.txt', times.toString(), err => {
    if (err) {
      console.error(err);
      return;
    }
    console.log('写入成功');
  });