'use strict';
const {spawn,spawnSync}=require('node:child_process'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const tag=crypto.randomBytes(4).toString('hex'),name='salud-sso-test-'+tag,password=crypto.randomBytes(20).toString('hex'),secret=crypto.randomBytes(32).toString('hex'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const good='a'.repeat(43),bad='b'.repeat(43),missingScope='c'.repeat(43);let app,identity,created=false,revoked=false;
function docker(args,input){const r=spawnSync('docker',args,{encoding:'utf8',input});if(r.status!==0)throw Error('Fallo Docker: '+String(r.stderr||'').slice(-250));return r.stdout.trim()}
(async()=>{try{
 docker(['run','--rm','-d','--name',name,'-p','127.0.0.1::5432','-e','POSTGRES_PASSWORD='+password,'postgres:16']);created=true;
 for(let i=0;i<80;i++){if(spawnSync('docker',['exec','-u','postgres',name,'createdb','salud_sso_test'],{stdio:'ignore'}).status===0)break;if(i===79)throw Error('Base no disponible');await sleep(250)}
 const port=Number(docker(['port',name,'5432/tcp']).split(':').pop());
 docker(['exec','-i',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-d','salud_sso_test'],`CREATE TABLE usuarios (id int primary key, username text,role text,password_hash text,sisa_code text,cuie_code text,maternidad_id int); CREATE TABLE maternidades(id int primary key,nombre text); CREATE TABLE efectores_sisa(codigo_sisa text,cuie text,nombre text); CREATE TABLE imi_sso_vinculos(usuario_central text primary key,usuario_salud_id int references usuarios(id),activo bool); INSERT INTO usuarios VALUES (1,'ficticio','Administrador','x',null,null,null),(2,'sin_centro','Centro de Salud','x',null,null,null); INSERT INTO imi_sso_vinculos VALUES ('central',1,true),('sin_centro',2,true);`);
 identity=http.createServer((req,res)=>{const c=req.headers.cookie?.slice(8);const uname=c===missingScope?'sin_centro':'central';const permitted=!revoked && c!==bad;res.setHeader('content-type','application/json');res.end(JSON.stringify({usuario:uname,tableros:permitted?[{codigo:'salud',rango:'acceso'}]:[]}))});await new Promise(r=>identity.listen(39001,'127.0.0.1',r));
 const env={...process.env,DB_HOST:'127.0.0.1',DB_PORT:String(port),DB_USER:'postgres',DB_PASSWORD:password,DB_NAME:'salud_sso_test',IMI_SSO_TEST_MODE:'si',NEXTAUTH_SECRET:secret,NEXTAUTH_URL:'http://127.0.0.1:38990/salud-dashboard/api/auth'};
 app=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','-p','38990','-H','127.0.0.1'],{env,stdio:'ignore'});const base='http://127.0.0.1:38990/salud-dashboard';
 for(let i=0;;i++){try{await fetch(base);break}catch(e){if(i===80)throw e;await sleep(250)}}
 async function available(c){return (await (await fetch(base+'/api/central-estado',{headers:{cookie:'imi_sso='+c}})).json()).disponible}
 assert.equal(await available(good),true);assert.equal(await available(bad),false);assert.equal(await available(missingScope),false);
 const initial=await fetch(base+'/api/auth/csrf');const csrf=await initial.json();const csrfCookie=initial.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
 const login=await fetch(base+'/api/auth/callback/imi-central',{method:'POST',redirect:'manual',headers:{cookie:csrfCookie+'; imi_sso='+good,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrfToken:csrf.csrfToken,callbackUrl:base,json:'true'})});
 const cookies=login.headers.getSetCookie().map(x=>x.split(';')[0]).filter(x=>x.includes('session-token='));assert.ok(cookies.length,'No se emitió sesión NextAuth');const cookie='imi_sso='+good+'; '+cookies.join('; ');
 let response=await fetch(base+'/api/auth/session',{headers:{cookie}});let session=await response.json();assert.equal(session.user.username,'ficticio');assert.equal(session.user.role,'Administrador');assert.equal(session.origin,'central');
 revoked=true;response=await fetch(base+'/api/auth/session',{headers:{cookie}});session=await response.json();assert.ok(!session.user,'Una sesión central revocada siguió activa');
 console.log('OK: vinculación explícita, alcance ausente, emisión y revocación de sesión central');
}finally{if(app){app.kill();await new Promise(r=>app.once('exit',r))}if(identity)await new Promise(r=>identity.close(r));if(created)spawnSync('docker',['rm','-f',name],{stdio:'ignore'})}})().catch(e=>{console.error(e);process.exitCode=1});
