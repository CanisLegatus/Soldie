// Keep the checked-in Android assets aligned with the same offline web source.
const fs = require('node:fs');
const path = require('node:path');
const source = path.resolve(__dirname,'../galamart-analyst');
const target = path.resolve(__dirname,'../android/app/src/main/assets/www');
for (const entry of ['index.html','vision.css','director.css','suadela.css','sales.css','js','lib','vision']) {
  fs.cpSync(path.join(source,entry),path.join(target,entry),{recursive:true});
}
console.log('Android assets synchronized (reports are excluded).');
