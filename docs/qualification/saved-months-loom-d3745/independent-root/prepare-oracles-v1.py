"""Public-contract-only month CLI fixtures; no candidate import or execution."""
import hashlib,json,os
from pathlib import Path
ROOT=Path(__file__).resolve().parent
FIX=ROOT/'fixtures';OUT=ROOT/'oracles'
FIX.mkdir(exist_ok=False);OUT.mkdir(exist_ok=False)
NOTICE='Recorded month keys from this saved ledger only. Counts describe saved row occurrences, not unique purchases or account completeness. Currency groups do not convert or total amounts. Legacy unassigned budgets retain no currency. Discovery does not imply that an existing monthly summary will accept the selected ledger and currency.'
def raw(x):return (json.dumps(x,ensure_ascii=False,separators=(',',':'))+'\n').encode()
def tx(id,date,currency,type='expense'):
 return {'id':id,'date':date,'currency':currency,'type':type,'amountMinor':100,'category':'pay','note':'saved α\nno projection','createdAt':'retained literal'}
def budget(month,currency=None,category='home'):
 d={'month':month,'category':category,'limitMinor':500}
 if currency is not None:d['currency']=currency
 return d
def group(currency,t,i,e,b):return {'currency':currency,'transaction_count':t,'income_count':i,'expense_count':e,'budget_count':b}
def month(m,s,t,b,u,c):return {'month':m,'summary_supported':s,'transaction_count':t,'budget_count':b,'unassigned_budget_count':u,'currencies':c}
mixed={'version':2,'transactions':[tx('same','2026-03-03',' uSd ','income'),tx('same','2026-03-03','USD'),tx('eur','2026-03-04','eur'),tx('jan','2026-01-01','usd','income'),tx('old','0100-02-01','jpy'),tx('pre','1969-12-31','GBP','income'),tx('floor','1970-01-01','USD')],'budgets':[budget('2026-03','USD'),budget('2026-03','eur'),budget('2026-01'),budget('9999-12'),budget('9999-12'),budget('0000-01','gbp')],'extra':'not emitted'}
rows=[month('0000-01',False,0,1,0,[group('GBP',0,0,0,1)]),month('0100-02',False,1,0,0,[group('JPY',1,0,1,0)]),month('1969-12',False,1,0,0,[group('GBP',1,1,0,0)]),month('1970-01',True,1,0,0,[group('USD',1,0,1,0)]),month('2026-01',True,1,1,1,[group('USD',1,1,0,0)]),month('2026-03',True,3,2,0,[group('EUR',1,0,1,1),group('USD',2,1,1,1)]),month('9999-12',True,0,2,2,[])]
cases=[]
def case(name,data=None,expected=None,args=None,exit_code=0,alias=None):
 path=FIX/(name+'.json')
 if alias:path.symlink_to(alias)
 elif data is not None:path.write_bytes(data)
 selector='fixtures/'+path.name
 argv=args if args is not None else ['--ledger',selector]
 r={'name':name,'argv':argv,'exit':exit_code}
 if expected is not None:
  b=path.read_bytes();t,bu,mo=expected
  result={'schema_version':1,'kind':'household.saved-months','source':{'path':selector,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()},'counts':{'transactions':t,'budgets':bu,'months':len(mo)},'months':mo,'notice':NOTICE}
  p=OUT/(name+'.stdout');p.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');r['stdout']=str(p.relative_to(ROOT))
 cases.append(r)
case('mixed',raw(mixed),(7,6,rows))
case('symlink',expected=(7,6,rows),alias='mixed.json')
empty=raw({'version':1,'transactions':[],'budgets':[]})
case('empty',empty,(0,0,[]))
invalid=json.loads(json.dumps(mixed));invalid['transactions'].append(tx('late','2026-02-30','USD'))
case('late-invalid',raw(invalid),exit_code=2)
case('legacy-denomination',raw({'version':1,'transactions':[],'budgets':[budget('2026-01','USD')]}),exit_code=2)
case('utf8',b'{"version":1,"transactions":[],"budgets":[],"x":"\xff"}',exit_code=2)
case('missing',exit_code=2)
case('extra-argument',args=['--ledger','fixtures/missing.json','--unknown'],exit_code=2)
case('byte-limit',empty+b' '*(16*1024*1024-len(empty)),(0,0,[]))
case('byte-over',empty+b' '*(16*1024*1024+1-len(empty)),exit_code=2)
large={'version':1,'transactions':[],'budgets':[budget('2026-05')]*100000}
case('row-limit',raw(large),(0,100000,[month('2026-05',True,0,100000,100000,[])]))
large['budgets'].append(budget('2026-05'));case('row-over',raw(large),exit_code=2)
(ROOT/'sentinel.txt').write_text('Occupied unrelated file: preserve me.\n')
native={'year':2026,'month':1,'currency':'USD','incomeMinor':100,'expenseMinor':0,'netMinor':100,'byCategory':{'pay':{'incomeMinor':100,'expenseMinor':0}},'budgets':[{'category':'home','limitMinor':500,'spentMinor':0,'remainingMinor':500,'over':False}]}
(OUT/'native-monthly.stdout').write_text(json.dumps(native,ensure_ascii=False,separators=(',',':'))+'\n')
(ROOT/'cases-v1.json').write_text(json.dumps({'schema':'hamon.root.household-months.cases.v1','source':'public contract77842158 and unchanged native validator only','cases':cases,'native_consumer':{'discovery_case':'mixed','month':'2026-01','currency':'USD','expected_stdout':'oracles/native-monthly.stdout'}},indent=2)+'\n')
print(json.dumps({'cases':len(cases),'product_executions':0,'fixture_files':len(list(FIX.iterdir())),'expectations':len(list(OUT.iterdir()))}))
