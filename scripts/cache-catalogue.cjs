// Populate only catalogue metadata. Game archives are never requested here.
const path=require('node:path');
const {CatalogueCache}=require('../electron/catalogue-cache.cjs');

(async()=>{
  const directory=path.resolve(process.argv[2] || path.join(process.env.APPDATA || process.cwd(),'Orbit','catalogue-cache'));
  const cache=new CatalogueCache({directory,autoWarm:false});
  let lastError;
  cache.on('warning',error=>{lastError=error;console.warn('Catalogue:',error.message);});
  cache.on('updated',data=>console.log(JSON.stringify({index:data.index,games:data.games,pagesCached:cache.pages.size})));
  await cache.initialize();
  try {
    for(let attempt=0;attempt<3;attempt++){
      await cache.start();
      if(cache.planKeys().every(key=>cache.indexes.has(key)))break;
      if(attempt<2)await new Promise(resolve=>setTimeout(resolve,2000));
    }
    const missing=cache.planKeys().filter(key=>!cache.indexes.has(key));
    if(missing.length)throw new Error(`Catalogue indexing incomplete (${missing.join(', ')}): ${lastError?.message || 'unknown error'}`);
    console.log(JSON.stringify({complete:true,games:cache.records.size,pages:cache.pages.size,directory}));
  } finally {await cache.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
