import {migrateAliases,validateBackup} from './learning.js';
const SNAPSHOT='pre-refonte-2026-10';
export function openDB(){return new Promise((resolve,reject)=>{
 const r=indexedDB.open('kotoba',2);
 r.onupgradeneeded=()=>{const db=r.result;
  if(!db.objectStoreNames.contains('states'))db.createObjectStore('states',{keyPath:'id'});
  if(!db.objectStoreNames.contains('reviews'))db.createObjectStore('reviews',{keyPath:'id',autoIncrement:true});
  if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta',{keyPath:'key'});
 };
 r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();resolve(r.result);};
 r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Ferme les autres onglets Kotoba, puis recharge la page.'));
});}
async function read(store,operation){const db=await openDB();return new Promise((resolve,reject)=>{
 const tx=db.transaction(store,'readonly');let result;
 const r=operation(tx.objectStore(store));r.onsuccess=()=>{result=r.result;};
 tx.oncomplete=()=>{db.close();resolve(result);};tx.onabort=tx.onerror=()=>{db.close();reject(tx.error||Error('Lecture impossible.'));};
});}
export const allStates=()=>read('states',s=>s.getAll());
export const allReviews=()=>read('reviews',s=>s.getAll());
export const getState=id=>read('states',s=>s.get(id));
export const getMeta=key=>read('meta',s=>s.get(key));
export const getSnapshot=async()=> (await getMeta(SNAPSHOT))?.payload;
async function write(stores,operation){const db=await openDB();return new Promise((resolve,reject)=>{
 const tx=db.transaction(stores,'readwrite');
 tx.oncomplete=()=>{db.close();resolve();};tx.onabort=tx.onerror=()=>{db.close();reject(tx.error||Error('Écriture impossible.'));};
 try{operation(tx);}catch(e){tx.abort();reject(e);}
});}
export const putMeta=(key,value)=>write(['meta'],tx=>tx.objectStore('meta').put({key,value}));
export const saveReview=(state,review)=>write(['states','reviews'],tx=>{
 tx.objectStore('states').put(state);tx.objectStore('reviews').add(review);
});
export async function migrateProgress(migration,exercises){
 if(!migration||typeof migration.aliases!=='object'||!migration.version)throw Error('Table de migration invalide.');
 // All reads/writes and the snapshot share a transaction: either everything commits or nothing does.
 await write(['states','reviews','meta'],tx=>{
  const meta=tx.objectStore('meta');const marker=meta.get(migration.version);
  marker.onsuccess=()=>{
   if(marker.result)return;
   const s=tx.objectStore('states').getAll();s.onsuccess=()=>{
    const r=tx.objectStore('reviews').getAll();r.onsuccess=()=>{
     if(s.result.length||r.result.length)meta.put({key:SNAPSHOT,payload:{version:1,exportedAt:new Date().toISOString(),states:s.result,reviews:r.result,exercises}});
     for(const state of migrateAliases(s.result,migration.aliases))tx.objectStore('states').put(state);
     meta.put({key:migration.version,value:true});
    };
   };
  };
 });
}
export async function importProgress(payload,aliases){
 validateBackup(payload);
 await write(['states','reviews','meta'],tx=>{
  const store=tx.objectStore('states');const s=store.getAll();s.onsuccess=()=>{
   const map=new Map(s.result.map(x=>[x.id,x]));
   for(const incoming of payload.states){const old=map.get(incoming.id);if(!old||Date.parse(incoming.updatedAt||incoming.card.last_review||'1970-01-01')>=Date.parse(old.updatedAt||old.card.last_review||'1970-01-01'))map.set(incoming.id,incoming);}
   for(const state of migrateAliases([...map.values()],aliases))store.put(state);
  };
  const reviews=tx.objectStore('reviews');const r=reviews.getAll();r.onsuccess=()=>{
   const signature=x=>JSON.stringify([x.stateId,x.reviewedAt,x.rating,x.due]);
   const known=new Set(r.result.map(signature));
   for(const review of payload.reviews){if(known.has(signature(review)))continue;known.add(signature(review));const copy={...review};delete copy.id;reviews.add(copy);}
  };
 });
}
