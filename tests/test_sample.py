"""Fictional centre generation and safe lifecycle regressions."""
import os
import sys
import unittest
from collections import Counter
from datetime import date
sys.path.insert(0,os.path.join(os.path.dirname(os.path.dirname(__file__)),'server'))
import sample
import domain as D


class SampleGeneratorTest(unittest.TestCase):
    def test_sample_lifecycle_requires_the_account_authority_before_any_data_write(self):
        from types import SimpleNamespace
        from auth import NotAuthority
        ctx=SimpleNamespace(need=lambda *args:None,scopes=None)
        auth=SimpleNamespace(node=SimpleNamespace(is_authority=False),authority_hint=lambda:'Use the administrator PC')
        # The fake context deliberately has no store: rejection must precede accessing business records.
        for operation in (sample.load,sample.remove):
            with self.assertRaises(NotAuthority): operation(ctx,auth,{})
    def test_reference_records_are_deterministic_and_valid(self):
        ops=sample.build(date(2026,10,4))
        self.assertEqual(ops,sample.build(date(2026,10,4)))
        counts=Counter(o['e'] for o in ops)
        for entity,n in [('students',420),('groups',24),('teachers',8),('rooms',4),('subjects',10)]:
            self.assertEqual(counts[entity],n)
        self.assertTrue(all(o['id'].startswith('smp-') for o in ops))
        keys=[(o['e'],o['id']) for o in ops]
        self.assertEqual(len(keys),len(set(keys)))
        students=[o['row'] for o in ops if o['e']=='students']
        self.assertEqual(len({s['code'] for s in students}),420)
        self.assertTrue(all(not D.check_grade(s['gradeCode'],s['system'],s.get('track')) for s in students))
        self.assertTrue(all(D.norm_mobile_eg(s['parentMobile'])[1] for s in students))
        self.assertEqual(len({s['familyKey'] for s in students if s.get('familyKey')}),30)
        self.assertEqual(sum(bool(s.get('exempt')) for s in students),6)
        groups=[dict(o['row'],id=o['id']) for o in ops if o['e']=='groups']
        rooms={o['id']:dict(o['row'],id=o['id']) for o in ops if o['e']=='rooms'}
        self.assertEqual(D.clashes(groups,rooms),[])

    def test_sample_codes_avoid_real_codes(self):
        ops=sample.build(date(2026,10,4),used_codes=['10000','10001','10005'])
        codes={o['row']['code'] for o in ops if o['e']=='students'}
        self.assertFalse(codes & {'10000','10001','10005'})

    def test_history_references_and_cash_drawers_are_consistent(self):
        ops=sample.build(date(2026,10,4));by={}
        for op in ops: by.setdefault(op['e'],{})[op['id']]=op['row']
        self.assertGreater(len(by['attendance']),5000)
        self.assertGreater(len(by['payments']),1000)
        self.assertGreater(len(by['marks']),1000)
        self.assertEqual(len(by['settlements']),6)
        self.assertEqual(len(by['materials']),10)
        self.assertEqual(len(by['followups']),10)
        for rid,row in by['attendance'].items():
            self.assertEqual(rid,D.attendance_id(row['sessionId'],row['studentId']))
            self.assertIn(row['sessionId'],by['sessions'])
            self.assertIn(row['studentId'],by['students'])
        for row in by['payments'].values():
            self.assertIn(row['shiftId'],by['shifts'])
            if row.get('voidOf'): self.assertIn(row['voidOf'],by['payments'])
        for rid,sh in by['shifts'].items():
            if sh['status']=='closed':
                expected=D.shift_expected(sh['openingCash'],[p for p in by['payments'].values() if p['shiftId']==rid],
                    [e for e in by['expenses'].values() if e['shiftId']==rid])
                self.assertEqual(sh['expectedCash'],expected)
                self.assertAlmostEqual(sh['countedCash']-expected,sh['diff'])
        self.assertEqual(sum(bool(sh.get('diff')) for sh in by['shifts'].values()),3)
        self.assertEqual(sum(sh['status']=='open' for sh in by['shifts'].values()),2)
        self.assertEqual(sum(bool(p.get('voidOf')) for p in by['payments'].values()),4)

    def test_week_boundaries_and_sample_id_namespace(self):
        from datetime import timedelta
        for i in range(7):
            self.assertTrue(sample.build(date(2026,10,4)+timedelta(days=i)))
        sid=D.session_id('smp-g1',date(2026,10,4),'17:00')
        self.assertTrue(sid.startswith('smp-'))
        self.assertTrue(D.attendance_id(sid,'smp-s1').startswith('smp-'))
        self.assertEqual(D.session_id('g1',date(2026,10,4),'17:00'),'se-g1-2026-10-04-1700')
        self.assertEqual(D.mark_id('ex1','s1'),'mk-ex1-s1')
        self.assertEqual(D.settlement_id('t1','2026-10'),'st-t1-2026-10')


class SampleApiTest(unittest.TestCase):
    def test_load_logic_privacy_performance_and_safe_removal(self):
        import json,time
        from harness import Server,make_authority,ApiError
        server=Server('sample-centre').start()
        try:
            client=make_authority(server)
            client.post('/api/commit',{'label':'Real data sentinel','ops':[
                {'e':'students','id':'real-student','op':'put','row':{'name':'Synthetic real-import sentinel','code':'10000','gradeCode':'S1','system':'bac'}},
                {'e':'settings','id':'receiptFooter','op':'put','row':{'value':'Preserve custom setting'}}]})
            before=client.get('/api/version')['version']
            loaded=client.post('/api/c/sample',{})
            self.assertFalse(loaded['already'])
            self.assertEqual(loaded['students'],420)
            self.assertEqual(client.get('/api/version')['version'],before+1)
            self.assertTrue(client.post('/api/c/sample',{})['already'])
            start=time.perf_counter();state=client.get('/api/state');state_seconds=time.perf_counter()-start
            self.assertEqual(len(state['students']),421)
            self.assertEqual(state['settings']['receiptFooter'],'Preserve custom setting')
            self.assertIn('النور',state['settings']['systemName'])
            self.assertEqual(len({s['code'] for s in state['students']}),421)
            start=time.perf_counter();dash=client.get('/api/c/dashboard');dashboard_seconds=time.perf_counter()-start
            self.assertEqual(dash['groups'],24);self.assertGreater(dash['monthMoney'],0);self.assertGreater(dash['monthExpenses'],0)
            self.assertGreater(dash['checkedIn'],0)
            risk=client.get('/api/c/risk')
            self.assertGreaterEqual(len(risk),10);self.assertLessEqual(len(risk),40)
            signals={g['signal'] for g in client.get('/api/c/reports?ym='+date.today().strftime('%Y-%m'))['profitability']}
            self.assertEqual(signals,{'full','merge','watch','ok','loss'})
            start=time.perf_counter();card=client.get('/api/c/card?id=smp-s100');card_seconds=time.perf_counter()-start
            self.assertTrue(card['enrollments'])
            self.assertEqual(len(card['today']),len({a['sessionId'] for a in card['today']}))
            state_bytes=len(json.dumps(state,ensure_ascii=False).encode())
            print('Sample performance:',json.dumps({'card_ms':round(card_seconds*1000),'dashboard_ms':round(dashboard_seconds*1000),
                'state_ms':round(state_seconds*1000),'state_bytes':state_bytes,'risk_rows':len(risk),'signals':sorted(signals)}))
            self.assertLess(card_seconds,0.150);self.assertLess(dashboard_seconds,0.400);self.assertLess(state_seconds,1.5);self.assertLess(state_bytes,6*1024*1024)
            teacher=server.client();teacher.login('t.ahmed',sample.PASSWORD)
            # Must-change accounts can read their scoped state while writes await password change.
            scoped=teacher.get('/api/state')
            self.assertTrue(scoped['groups'])
            self.assertEqual({g['teacherId'] for g in scoped['groups']},{'smp-t4'})
            self.assertNotIn('real-student',{s['id'] for s in scoped['students']})
            with self.assertRaises(ApiError): teacher.post('/api/c/sample/delete',{})
            removed=client.post('/api/c/sample/delete',{})
            self.assertGreater(removed['changes'],1000);self.assertEqual(removed['accountsRemoved'],5)
            after=client.get('/api/state')
            self.assertEqual([s['id'] for s in after['students']],['real-student'])
            self.assertNotIn('smp-centre',after['settings'])
            self.assertEqual(after['settings']['receiptFooter'],'Preserve custom setting')
            self.assertEqual(client.post('/api/c/sample/delete',{})['changes'],0)
            for key,value in after.items():
                if isinstance(value,list):self.assertFalse(any(r.get('id','').startswith('smp-') for r in value))
            self.assertTrue(client.get('/api/trash'))
            self.assertTrue(client.post('/api/devices/verify',{'all':True})['ok'])
            with self.assertRaises(ApiError): server.client().login('desk1',sample.PASSWORD)
            self.assertEqual(client.post('/api/c/sample',{})['students'],420)
            self.assertEqual(len(client.get('/api/state')['students']),421)
            self.assertTrue(server.client().login('desk1',sample.PASSWORD))
            client.post('/api/c/sample/delete',{})
            self.assertTrue(client.post('/api/devices/verify',{'all':True})['ok'])
        finally:
            server.cleanup()
