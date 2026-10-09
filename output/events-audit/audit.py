import json, collections, datetime
from jsonschema import Draft202012Validator, FormatChecker
from pathlib import Path
p=Path('output/events-audit'); rows=json.loads((p/'remote-events.json').read_text()); s=json.loads(Path('output/schemas/growth_events.v2.schema.json').read_text()); v=Draft202012Validator(s,format_checker=FormatChecker()); errors=collections.Counter(); by={}; keys={}; nulls=collections.Counter(); passed=0
for r in rows:
 e={k:val for k,val in r.items() if k in s['properties']}
 if e.get('client_ts') is not None:e['client_ts']=int(e['client_ts'])
 errs=list(v.iter_errors(e)); passed+=not errs
 name=r['event_name']; b=by.setdefault(name,{'count':0,'valid':0,'errors':collections.Counter()}); b['count']+=1;b['valid']+=not errs
 for err in errs:
  path='.'.join(map(str,err.absolute_path)) or '$'; msg=err.message
  if err.validator=='required': msg=msg.split(' is a required')[0]+' missing'
  elif err.validator=='type':msg='expected '+str(err.validator_value)
  elif err.validator=='enum':msg='outside enum'
  elif err.validator=='additionalProperties':msg='unexpected keys '+','.join(sorted(set(err.instance)-set(err.schema.get('properties',{}))))
  else:msg=err.validator
  errors[path+': '+msg]+=1;b['errors'][path+': '+msg]+=1
 props=r.get('properties') or {}; kk=keys.setdefault(name,collections.Counter());kk.update(props.keys() if isinstance(props,dict) else [])
 for k,val in e.items():
  if val is None or val=='':nulls[k]+=1
out={'rows':len(rows),'valid':passed,'missing_columns':sorted(set(s['required'])-set(rows[0])),'extra_columns':sorted(set(rows[0])-set(s['properties'])),'errors':dict(errors),'null_or_empty':dict(nulls),'by_event':{n:{**b,'errors':dict(b['errors']),'property_keys':dict(keys[n])} for n,b in by.items()},'distinct_users':len({r['user_id'] for r in rows if r['user_id']}),'distinct_anonymous':len({r['anonymous_id'] for r in rows if r['anonymous_id']}),'duplicate_event_ids':len(rows)-len({r['event_id'] for r in rows}),'time_range':[datetime.datetime.fromtimestamp(int(t)/1000,datetime.timezone(datetime.timedelta(hours=7))).isoformat() for t in [min(r['client_ts'] for r in rows),max(r['client_ts'] for r in rows)]]}
(p/'audit-summary.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)); print(json.dumps(out,ensure_ascii=False,indent=2))
