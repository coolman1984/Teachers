"""Generate fictional centre JSON or load it into a running local Hessa instance."""
import argparse
import getpass
import http.cookiejar
import json
import sys
import urllib.request
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
import sample


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=Path('data/sample-centre.json'))
    parser.add_argument('--date',type=date.fromisoformat,default=date.today())
    parser.add_argument('--load',action='store_true')
    parser.add_argument('--url',default='http://127.0.0.1:8095')
    parser.add_argument('--username',default='admin')
    args=parser.parse_args()
    if args.load:
        parsed=urlparse(args.url)
        if parsed.scheme not in ('http','https') or parsed.hostname not in ('localhost','127.0.0.1','::1'):
            parser.error('--load only accepts the local centre server')
        opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        def post(path,body):
            req=urllib.request.Request(args.url.rstrip('/')+path,data=json.dumps(body).encode(),method='POST',
                headers={'Content-Type':'application/json','Origin':args.url.rstrip('/')})
            with opener.open(req,timeout=120) as response:return json.load(response)
        post('/api/auth/login',{'username':args.username,'password':getpass.getpass('Administrator password: ')})
        result=post('/api/c/sample',{})
        print(json.dumps(result,ensure_ascii=False))
        print('Sample users: '+', '.join(a[0] for a in sample.ACCOUNT_SPECS)+'; temporary password: '+str(result.get('password')))
    else:
        ops=sample.build(args.date)
        args.output.parent.mkdir(parents=True,exist_ok=True)
        args.output.write_text(json.dumps({'date':args.date.isoformat(),'ops':ops},ensure_ascii=False),encoding='utf-8')
        print(str(args.output.resolve())+' — '+str(len(ops))+' fictional records')


if __name__=='__main__':main()
