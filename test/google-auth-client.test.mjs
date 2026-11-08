import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient } from '../src/lib/api-client.ts';
const baseUrl = 'https://api.test/api/v1';
const user = (id='user-a') => ({id,email:`${id}@example.test`,emailVerified:null,role:'ADMIN',interfaceLanguage:'ru',translationLanguage:'ru'});
const auth = (token='a',id='user-a') => Response.json({user:user(id),accessToken:token.repeat(43)});
const error = status => Response.json({message:'failed'},{status});
const challenge = () => ({enabled:true,clientId:'123-test.apps.googleusercontent.com',nonce:'n'.repeat(43),expiresAt:new Date(Date.now()+600000).toISOString()});
const deferred = () => {let resolve;const promise=new Promise(done=>{resolve=done});return {resolve,promise};};

test('Google configuration and login challenge are public, cookie-bound and do not replace the account', async()=>{
  const calls=[];let locks=0;
  const client=new ApiClient({baseUrl,authLock:async work=>{locks++;return work()},fetch:async(url,init)=>{
    calls.push({url,init});return Response.json(url.endsWith('/config')?{enabled:true,clientId:challenge().clientId}:challenge());
  }});
  assert.equal((await client.googleConfig()).enabled,true);
  const abort=new AbortController(); assert.equal((await client.googleChallenge('login',abort.signal)).nonce,'n'.repeat(43));
  assert.equal(calls[1].url,baseUrl+'/auth/google/challenge');assert.equal(calls[1].init.credentials,'include');assert.equal(calls[1].init.signal,abort.signal);
  assert.equal(locks,1);assert.equal(client.getSnapshot().user,null);
});
test('an older backend without Google leaves ordinary login available; service failures remain visible',async()=>{
  for(const status of [404,401,403,500,503]){
    const client=new ApiClient({baseUrl,fetch:async url=>url.endsWith('/auth/login')?auth():new Response('not JSON',{status})});
    await client.signIn('a@example.test','long password');
    if(status===404) assert.deepEqual(await client.googleConfig(),{enabled:false});
    else await assert.rejects(client.googleConfig(),failure=>failure.status===status);
    assert.equal(client.getSnapshot().user.id,'user-a');
  }
});

test('Google sign-in uses only the credential and the existing in-memory session handling',async()=>{
  const calls=[];const client=new ApiClient({baseUrl,fetch:async(url,init)=>{calls.push({url,init});return url.endsWith('/auth/google')?auth():Response.json([])}});
  await client.signInWithGoogle('a.b.c'); await client.request('/words/mine');
  assert.deepEqual(JSON.parse(calls[0].init.body),{credential:'a.b.c'});
  assert.equal(calls[0].init.credentials,'include');assert.equal(new Headers(calls[1].init.headers).get('Authorization'),'Bearer '+'a'.repeat(43));
  assert.equal(client.getSnapshot().user.id,'user-a');
});
test('failed or malformed Google responses never authenticate and never retry the mutation',async()=>{
  for(const response of [error(409),Response.json({user:user(),accessToken:'bad'})]){
    let count=0;const client=new ApiClient({baseUrl,fetch:async()=>{count++;return response}});
    await assert.rejects(client.signInWithGoogle('a.b.c'));assert.equal(count,1);assert.equal(client.getSnapshot().user,null);
  }
  const client=new ApiClient({baseUrl,fetch:async()=>{throw Error('must not write')}});
  for(const value of ['bad','a'.repeat(10001)])await assert.rejects(client.signInWithGoogle(value));
});
test('linking sends current bearer and exact password without replacing identity or role from its response',async()=>{
  let link;const client=new ApiClient({baseUrl,fetch:async(url,init)=>{
    if(url.endsWith('/auth/login'))return auth();link={url,init};return Response.json({connected:true,user:user('attacker'),role:'USER'});
  }});
  await client.signIn('a@example.test','unchanged password');const before=client.getSnapshot().user;
  await client.linkGoogle('a.b.c',' exact password 123 ');
  assert.deepEqual(JSON.parse(link.init.body),{credential:'a.b.c',password:' exact password 123 '});
  assert.equal(new Headers(link.init.headers).get('Authorization'),'Bearer '+'a'.repeat(43));assert.deepEqual(client.getSnapshot().user,before);
});
test('wrong link password and invalid Google token do not refresh or clear the current account',async()=>{
  for(const status of [400,403,409,500]){
    let writes=0;const client=new ApiClient({baseUrl,fetch:async url=>{
      if(url.endsWith('/auth/login'))return auth();assert.ok(url.endsWith('/auth/google/link'));writes++;return error(status);
    }});
    await client.signIn('a@example.test','long password');await assert.rejects(client.linkGoogle('a.b.c','A long password 123!'));
    assert.equal(writes,1);assert.equal(client.getSnapshot().user.id,'user-a');
  }
});
test('an expired bearer refreshes within the auth lock and retries the exact linking body only once',async()=>{
  const requests=[];let attempts=0;
  const client=new ApiClient({baseUrl,fetch:async(url,init)=>{
    if(url.endsWith('/auth/login'))return auth();if(url.endsWith('/auth/refresh'))return auth('b');
    requests.push(init);return ++attempts===1?error(401):Response.json({connected:true});
  }});
  await client.signIn('a@example.test','long password');await client.linkGoogle('a.b.c','A long password 123!');
  assert.equal(requests.length,2);assert.equal(requests[0].body,requests[1].body);
  assert.equal(new Headers(requests[1].headers).get('Authorization'),'Bearer '+'b'.repeat(43));
});
test('refreshing a different account cannot send a Google credential or password under that account',async()=>{
  let links=0;const client=new ApiClient({baseUrl,fetch:async url=>{
    if(url.endsWith('/auth/login'))return auth();if(url.endsWith('/auth/refresh'))return auth('b','other-user');links++;return error(401);
  }});
  await client.signIn('a@example.test','long password');await assert.rejects(client.linkGoogle('a.b.c','A long password 123!'));
  assert.equal(links,1);assert.equal(client.getSnapshot().user,null);
});
test('a delayed challenge cannot survive a later login or be reused for a changed session',async()=>{
  const body=deferred();const client=new ApiClient({baseUrl,fetch:async url=>url.endsWith('/challenge')?{ok:true,json:()=>body.promise}:auth()});
  const pending=client.googleChallenge('login');await new Promise(resolve=>setImmediate(resolve));
  await client.signIn('a@example.test','long password');body.resolve(challenge());await assert.rejects(pending,error=>error.status===401);
  assert.equal(client.getSnapshot().user.id,'user-a');
});
test('a delayed linking response cannot confirm a changed account',async()=>{
  const body=deferred();let count=0;const client=new ApiClient({baseUrl,fetch:async url=>{
    if(url.endsWith('/auth/login'))return auth(++count===1?'a':'b',count===1?'user-a':'user-b');return {ok:true,status:200,json:()=>body.promise};
  }});
  await client.signIn('a@example.test','long password');const link=client.linkGoogle('a.b.c','A long password 123!');
  await new Promise(resolve=>setImmediate(resolve));await client.signIn('b@example.test','long password');body.resolve({connected:true});
  await assert.rejects(link,error=>error.status===401);assert.equal(client.getSnapshot().user.id,'user-b');
});
test('a linking refresh cannot roll back a newer language preference',async()=>{
  const refresh=deferred();let linking=0;const client=new ApiClient({baseUrl,fetch:async(url)=>{
    if(url.endsWith('/auth/login'))return auth();if(url.endsWith('/auth/refresh'))return refresh.promise;
    if(url.endsWith('/users/me/preferences'))return Response.json({interfaceLanguage:'ru',translationLanguage:'en'});
    return ++linking===1?error(401):Response.json({connected:true});
  }});
  await client.signIn('a@example.test','long password');const link=client.linkGoogle('a.b.c','A long password 123!');
  await new Promise(resolve=>setImmediate(resolve));await client.updateTranslationLanguage('en');refresh.resolve(auth('b'));
  await link;assert.equal(client.getSnapshot().user.translationLanguage,'en');
});
test('disabled and malformed config/challenge responses cannot supply arbitrary client IDs or nonce values',async()=>{
  for(const data of [{enabled:true,clientId:'https://evil.test'},null,{}]){
    const client=new ApiClient({baseUrl,fetch:async()=>Response.json(data)});await assert.rejects(client.googleConfig());
  }
  for(const data of [{...challenge(),nonce:'bad'},{...challenge(),expiresAt:'bad'},{...challenge(),expiresAt:new Date(0).toISOString()}]){
    const client=new ApiClient({baseUrl,fetch:async()=>Response.json(data)});await assert.rejects(client.googleChallenge('login'));
  }
  const client=new ApiClient({baseUrl,fetch:async()=>Response.json({enabled:false,secret:'ignored'})});assert.deepEqual(await client.googleConfig(),{enabled:false});
});
