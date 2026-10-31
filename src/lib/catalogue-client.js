export const catalogueKey = ({page=1,keywords='',category='all',sort='views',collection}={}) => JSON.stringify({page,keywords:keywords.trim(),category,sort,...(collection ? {collection} : {})});

// Returning to a page or route reuses parsed records, not another IPC/fetch.
export function createCatalogueClient({read,parse,now=Date.now,ttl=15*60*1000}) {
  const pages=new Map(),pending=new Map();let generation=0;
  const put=(key,data)=>{if(pages.size>=256&&!pages.has(key))pages.delete(pages.keys().next().value);pages.set(key,{data,at:now()});};
  return {
    peek(options){return pages.get(catalogueKey(options))?.data;},
    load(options,{force=false}={}){
      const key=catalogueKey(options),cached=pages.get(key);
      if(!force && cached && now()-cached.at<ttl)return Promise.resolve(cached.data);
      if(pending.has(key))return pending.get(key);
      const version=generation;
      const task=Promise.resolve().then(()=>read(options)).then(data=>{
        const parsed=parse(data,options.page);
        if(version===generation){put(key,parsed);put(catalogueKey({...options,page:parsed.page}),parsed);}
        return parsed;
      }).finally(()=>{if(pending.get(key)===task)pending.delete(key);});
      pending.set(key,task);return task;
    },
    prefetch(options){return this.load(options).catch(()=>null);},
    invalidate(){generation++;pages.clear();pending.clear();},
  };
}
