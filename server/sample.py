"""Deterministic fictional centre data. Every business id is removable by its smp- prefix.

Dates are relative to the supplied day; no generated data is read from a user's files.
"""
import math
import random
from collections import Counter
from datetime import date, timedelta

import domain as D

PASSWORD = 'Hessa-2026!'
SUBJECTS = [('لغة عربية', 'Arabic'), ('رياضيات', 'Mathematics'), ('علوم', 'Science'), ('لغة إنجليزية', 'English'),
            ('فيزياء', 'Physics'), ('كيمياء', 'Chemistry'), ('أحياء', 'Biology'), ('تاريخ', 'History'),
            ('جغرافيا', 'Geography'), ('فلسفة ومنطق', 'Philosophy and logic')]
MALE = 'أحمد محمد محمود علي عمر يوسف إبراهيم مصطفى حسن حسين خالد ياسر طارق سامح سعيد كريم مروان زياد أدهم مالك عبدالله عبدالرحمن عبداللطيف عبدالحميد عبدالفتاح عمرو هشام شريف وليد إيهاب إسلام بلال حمزة أنس معاذ سيف فارس عادل عصام فؤاد شادي رامي مازن هاني حسام تامر أشرف جمال نادر أمير باسم حازم رائد عاصم جلال عمار عاصي صالح يحيى نوح'.split()
FEMALE = 'مريم فاطمة نور سارة هاجر ياسمين سلمى آية ملك جنى ندى منة إيمان دعاء أسماء حبيبة رنا رقية ليلى هنا نادين روان رحمة بسمة دينا هبة شيماء زينب نجلاء نهى سهى نسرين هند أميرة ريم شهد ريتاج تمارا لجين لينا فرح فريدة يارا هيا مي مها سمر سلوى نادية عبير أمل أحلام رباب سحر صفاء وفاء صباح بثينة داليا نانسي'.split()
FAMILY = 'حسن حسين علي إبراهيم محمود محمد عبدالعزيز عبدالرحمن عبدالحميد عبدالفتاح عبداللطيف عبدالله عبدالهادي عبدالسلام عبدالمنعم عبدالقادر عادل سعيد صالح فؤاد جمال طارق شريف ياسر أشرف هاني أحمد مصطفى عمر خالد سامح وليد نادر ناصر منصور سالم سلامة رمضان رجب شعبان جلال كمال زكي توفيق كامل صبري صابر مراد إسماعيل عثمان سليمان داود خليل عوض شعبان عبدالباسط عبدالجواد راضي رشدي فهمي'.split()
GRADES = ['P4','P4','P5','P5','P6','P6','M1','M1','M2','M2','M3','M3','S1','S1','S1','S2','S2','S2','S2','S3','S3','S3','S3','S3']


def build(today=None, used_codes=(), user_ids=None, node_id="sample-node"):
    today = today or date.today()
    rng = random.Random(2026)
    first_day = today - timedelta(days=55)
    ops, entities = [], {}
    def add(entity, rid, row):
        assert rid.startswith('smp-')
        entities.setdefault(entity, {})[rid] = row
        ops.append({'e':entity, 'id':rid, 'op':'put', 'row':row})
        return rid
    add('settings', 'smp-centre', {'value': {'systemName':'سنتر النور التعليمي — مدينة نصر',
        'systemNameEn':'Al-Nour Learning Centre', 'logoText':'النور', 'academicYear':str(today.year)+'/'+str(today.year+1)}})
    for i, (name, en) in enumerate(SUBJECTS):
        add('subjects', 'smp-sub'+str(i), {'name':name,'nameEn':en,'order':i,'color':'signal','active':True})
    for i, (name, cap, cost) in enumerate([('A',40,20),('B',30,20),('C',25,20),('Lab',20,1500)]):
        add('rooms','smp-room'+str(i),{'name':name,'capacity':cap,'costPerHour':cost,'active':True,'notes':'Fictional sample room'})
    terms = [('centerPct',20),('centerPct',30),('rentSession',150),('rentSession',300),('rentStudent',10),('rentStudent',15),('rentMonth',3000),('mixed',1500)]
    for i, (model, amount) in enumerate(terms):
        row={'name':'أستاذ '+MALE[i]+' '+FAMILY[i], 'nameKey':D.key_text('أستاذ '+MALE[i]+' '+FAMILY[i]), 'mobile':'010'+str(90001000+i),
             'settleModel':model,'subjectIds':['smp-sub'+str(i)],'gradeCodes':sorted(set(GRADES[i*3:i*3+3])),
             'color':['signal','ok','info','warn'][i%4], 'active':True,'bio':'معلم تجريبي — بيانات غير حقيقية','notes':'Fictional sample teacher'}
        row.update({'rentMonth':amount,'centerPct':10} if model=='mixed' else {model:amount})
        add('teachers','smp-t'+str(i),row)
    for i, grade in enumerate(GRADES):
        teacher='smp-t'+str(i//3)
        system='general' if grade[0]!='S' else 'bac' if grade in ('S1','S2') else 'thanaweya'
        track='' if grade!='S2' and grade!='S3' else ['med','eng'][i%2] if grade=='S2' else ['science','math','literary'][i%3]
        room='smp-room'+str(i%4); school=i in (8,20); start='17:00' if i<12 else '19:00'; end='18:30' if i<12 else '20:30'
        ft='session' if school else D.FEE_TYPES[i%3]
        add('groups','smp-g'+str(i),{'name':SUBJECTS[i//3][0]+' '+grade+' '+str(i+1),'teacherId':teacher,'subjectId':'smp-sub'+str(i//3),
            'gradeCode':grade,'system':system,'track':track,'roomId':room,'slots':[{'day':(i//4)%6,'start':start,'end':end,'roomId':room},
            {'day':((i//4)+3)%6,'start':start,'end':end,'roomId':room}], 'capacity':25 if school else entities['rooms'][room]['capacity'],
            'feeType':ft,'fee':60 if school else {'session':50,'month':400,'package':400}[ft],'packageSessions':8,
            'startDate':first_day.isoformat(),'kind':'school' if school else 'home' if i==0 else 'center','active':True,'color':'signal'})
    for i in (3,7,11,14):
        g=entities['groups']['smp-g'+str(i)];g['roomId']='smp-room0';g['capacity']=40
        for slot in g['slots']:
            slot.update(roomId='smp-room0',start='21:00' if i==14 else '15:00',end='22:00' if i==14 else '16:30')
    grades=list(dict.fromkeys(GRADES)); codes={str(c) for c in used_codes}; candidate=10000
    for i in range(420):
        while str(candidate) in codes: candidate+=1
        code=str(candidate);codes.add(code);candidate+=1
        grade=grades[i%len(grades)]; choices=[j for j,g in enumerate(GRADES) if g==grade]
        primary=grade[0]!='S'; chosen=[choices[(i//len(grades))%len(choices)]] if primary else rng.sample(choices,rng.randint(1,min(3,len(choices))))
        if grade=='P4': chosen=[0 if i//len(grades)<36 else 1]
        chosen=[j for j in chosen if entities['groups']['smp-g'+str(j)]['track'] == entities['groups']['smp-g'+str(chosen[0])]['track']]
        g=entities['groups']['smp-g'+str(chosen[0])]; sid='smp-s'+str(i); gender='female' if i%2 else 'male'
        name=(FEMALE if gender=='female' else MALE)[i%60]+' '+MALE[(i*7)%60]+' '+FAMILY[(i*11)%60]
        row={'name':name,'nameKey':D.key_text(name),'code':code,'gradeCode':grade,'system':g['system'],'track':g['track'],'gender':gender,
             'parentName':MALE[(i*7)%60]+' '+FAMILY[(i*11)%60], 'parentMobile':['010','011','012','015'][i%4]+str(90000000+i),
             'school':['مدرسة النور التجريبية','مدرسة الأمل التجريبية','مدرسة المستقبل التجريبية'][i%3], 'active':True,
             'consent':True,'consentAt':first_day.isoformat(),'joinedAt':first_day.isoformat(),'notes':'Fictional sample student; do not contact this number.'}
        if i<60: row.update(familyKey='smp-family'+str(i//2),discountPct=10+(i//2)%4*5,discountReason='أشقاء — بيانات تجريبية')
        if 60<=i<66: row.update(exempt=True,discountReason='إعفاء تجريبي')
        add('students',sid,row)
        for j in chosen:
            gid='smp-g'+str(j); add('enrollments','smp-en-'+str(i)+'-'+str(j),{'studentId':sid,'groupId':gid,'teacherId':entities['groups'][gid]['teacherId'],
                'from':first_day.isoformat(),'status':'active'})
    counts=Counter(e['groupId'] for e in entities['enrollments'].values())
    entities['groups']['smp-g0']['capacity']=counts['smp-g0']
    entities['groups']['smp-g21']['capacity']=18
    entities['groups']['smp-g1']['capacity']=40
    entities['groups']['smp-g1']['roomId']='smp-room0'
    for slot in entities['groups']['smp-g1']['slots']: slot['roomId']='smp-room0'
    # Allocate two weekly slots without double-booking a room or teacher.
    busy_rooms, busy_teachers = set(), set()
    for g in entities['groups'].values():
        preferred = g['slots'][0]['start']
        choices = [preferred] + [t for t in ('15:00','17:00','19:00','21:00') if t != preferred]
        placed = False
        for start in choices:
            for day in range(3):
                days = (day, day+3)
                if any((d,start,g['roomId']) in busy_rooms or (d,start,g['teacherId']) in busy_teachers for d in days):
                    continue
                end = {'15:00':'16:30','17:00':'18:30','19:00':'20:30','21:00':'22:00'}[start]
                g['slots'] = [{'day':d,'start':start,'end':end,'roomId':g['roomId']} for d in days]
                for d in days:
                    busy_rooms.add((d,start,g['roomId'])); busy_teachers.add((d,start,g['teacherId']))
                placed = True
                break
            if placed: break
        assert placed, 'Sample timetable has no available room/teacher slot'
    user_ids = user_ids or {name:'smp-user-'+name for name in ('desk1','desk2')}
    shifts = {}
    for offset in range(56):
        day=first_day+timedelta(days=offset)
        if D.weekday(day)==6 and day!=today: continue
        for username in ('desk1','desk2'):
            shid='smp-sh-'+day.isoformat()+'-'+username
            row={'no':D.doc_no('S',day.year,'DEMO',offset*2+(1 if username=='desk1' else 2)), 'user':username,'userId':user_ids[username],
                 'node':node_id,'openedAt':day.isoformat()+'T14:00:00','openingCash':200,'status':'open' if day==today else 'closed'}
            shifts[(day.isoformat(),username)] = (shid,row)
            add('shifts',shid,row)
    visits=Counter(); group_sessions={}; risky={'smp-s'+str(i) for i in range(25)}
    enrollments_by_group={gid:[e for e in entities['enrollments'].values() if e['groupId']==gid] for gid in entities['groups']}
    for gid,g in entities['groups'].items():
        sessions=[]
        for offset in range(56):
            day=first_day+timedelta(days=offset)
            for slot in D.slots_on(g,day):
                sid=D.session_id(gid,day,slot['start']); sessions.append((sid,day))
                add('sessions',sid,{'groupId':gid,'teacherId':g['teacherId'],'date':day.isoformat(),'start':slot['start'],
                    'end':slot['end'],'roomId':g['roomId'],'status':'held','kind':'regular','topic':'مراجعة تجريبية'})
        group_sessions[gid]=sessions
        for sid,day in sessions:
            for e in enrollments_by_group[gid]:
                roll=rng.random(); status='present' if roll<0.88 else 'late' if roll<0.95 else 'absent'
                if e['studentId'] in risky and day>=today-timedelta(days=14): status='absent'
                # One low-attendance group makes the "watch" signal explicit.
                if gid=='smp-g21' and int(e['studentId'][5:])%3!=0: status='excused'
                add('attendance',D.attendance_id(sid,e['studentId']),{'sessionId':sid,'studentId':e['studentId'],'groupId':gid,
                    'teacherId':g['teacherId'],'date':day.isoformat(),'status':status,'at':entities['sessions'][sid]['start'] if status!='late' else D.fmt_hm(D.hm(entities['sessions'][sid]['start'])+25),
                    'via':'sample','makeup':False,'by':'desk1'})
                if status in D.ATT_PRESENT: visits[(e['studentId'],gid)]+=1
    pay_sequence=0
    def receipt(student, group, amount, day, kind='fee', **extra):
        nonlocal pay_sequence
        pay_sequence+=1
        username='desk1' if pay_sequence%2 else 'desk2'; sh=shifts.get((day.isoformat(),username))
        if not sh:
            day=day+timedelta(days=1) if day==first_day else day-timedelta(days=1); sh=shifts[(day.isoformat(),username)]
        method=rng.choices(['cash','vodafone','instapay','fawry'],weights=[70,18,9,3])[0]
        row={'no':D.doc_no('R',day.year,'DEMO',pay_sequence),'date':day.isoformat(),'at':'18:00','studentId':student,
             'groupId':group or '', 'teacherId':(entities['groups'].get(group) or {}).get('teacherId') or '', 'kind':kind,
             'amount':round(amount,2),'method':method,'shiftId':sh[0],'by':username,'note':'Fictional sample payment',**extra}
        rid=add('payments','smp-pa'+str(pay_sequence),row)
        return rid,row
    for eid,e in entities['enrollments'].items():
        gid,sid=e['groupId'],e['studentId'];g=entities['groups'][gid];st=entities['students'][sid]
        count=visits[(sid,gid)];unit=D.unit_fee(g,e,st);ft=g['feeType'];sessions=group_sessions[gid]
        if not unit: continue
        if ft=='session':
            paid=0
            for se,day in sessions:
                att=entities['attendance'][D.attendance_id(se,sid)]
                if att['status'] in D.ATT_PRESENT and rng.random()<0.8:
                    receipt(sid,gid,unit,day);paid+=unit
            # Most families clear arrears at month end; 12 debt cases remain.
            owed=unit*count
            if int(sid[5:])>=12 and owed>paid: receipt(sid,gid,owed-paid,today)
        elif ft=='month':
            months=D.months_between(first_day,today)
            for month_index in range(months):
                y=first_day.year+(first_day.month-1+month_index)//12;m=(first_day.month-1+month_index)%12+1
                paid_day=min(today,max(first_day,date(y,m,min(10,today.day if (y,m)==(today.year,today.month) else 10))))
                if int(sid[5:])>=12 or month_index==0: receipt(sid,gid,unit,paid_day,period=f'{y:04d}-{m:02d}')
        else:
            packs=math.ceil(count/8)
            for n in range(packs):
                day=sessions[min(n*8,len(sessions)-1)][1] if sessions else today
                receipt(sid,gid,unit,day,sessions=8)
    for i in range(10):
        mid='smp-m'+str(i);tid='smp-t'+str(i%8)
        add('materials',mid,{'name':'مذكرة تجريبية '+SUBJECTS[i][0],'teacherId':tid,'gradeCode':GRADES[(i%8)*3],
            'price':40,'cost':15,'stock':97,'active':True})
        receipt('smp-s'+str(i),None,120,today,kind='material',materialId=mid,qty=3,teacherId=tid)
    for i in range(4):
        original,row=receipt('smp-s'+str(100+i),'smp-g12',50,today)
        receipt(row['studentId'],row['groupId'],-50,today,voidOf=original,note='Synthetic correction',method=row['method'])
    expense_seq=0
    def expense(category,amount,day,teacher='',group=''):
        nonlocal expense_seq
        expense_seq+=1;username='desk1';sh=shifts.get((day.isoformat(),username))
        if not sh:
            day=day+timedelta(days=1) if day==first_day else day-timedelta(days=1);sh=shifts[(day.isoformat(),username)]
        add('expenses','smp-exp'+str(expense_seq),{'no':D.doc_no('E',day.year,'DEMO',expense_seq),'date':day.isoformat(),'at':'20:00',
            'category':category,'amount':amount,'teacherId':teacher,'groupId':group,'method':'cash','shiftId':sh[0],
            'by':username,'note':'Fictional sample expense'})
    for category,amount in [('rent',8000),('electricity',900),('salaries',5000),('printing',600)]: expense(category,amount,today)
    month_end=today.replace(day=1)-timedelta(days=1)
    for i in range(6): expense('teacher_payout',500,month_end,'smp-t'+str(i))
    for (day,username),(shid,row) in shifts.items():
        pays=[p for p in entities['payments'].values() if p.get('shiftId')==shid]
        expenses=[p for p in entities.get('expenses',{}).values() if p.get('shiftId')==shid]
        if row['status']=='closed':
            expected=D.shift_expected(200,pays,expenses);diff=5 if len([r for r in entities['shifts'].values() if r.get('diff')])<3 else 0
            row.update(closedAt=day+'T22:00:00',expectedCash=expected,countedCash=expected+diff,diff=diff,diffReason='فرق تجريبي موثق' if diff else '')
    score_bases={sid:rng.gauss(68,15) for sid in entities['students']}
    for gid,g in entities['groups'].items():
        sessions=group_sessions[gid]
        schedule=[(week,'weekly',today-timedelta(days=(7-week)*7)) for week in range(8)] if g['gradeCode'].startswith('S') else []
        months=sorted({d.strftime('%Y-%m') for _,d in sessions})
        schedule += [(8+k,'monthly',min(today,date.fromisoformat(ym+'-01')+timedelta(days=20))) for k,ym in enumerate(months)]
        for k,kind,day in schedule:
            exid='smp-ex-'+gid+'-'+str(k)
            add('exams',exid,{'title':'اختبار تجريبي '+g['name']+' '+str(k+1),'teacherId':g['teacherId'],'groupIds':[gid],
                'date':day.isoformat(),'kind':kind,'maxScore':100,'questions':20,'choices':4,'answerKey':['A','B','C','D']*5,'published':True})
            for e in enrollments_by_group[gid]:
                sid=e['studentId'];score=max(0,min(100,round(rng.gauss(score_bases[sid],3),1)))
                if sid in risky: score=78 if k<6 else 38 if k==6 else 30
                add('marks',D.mark_id(exid,sid),{'examId':exid,'studentId':sid,'teacherId':g['teacherId'],'score':score,'absent':False,'via':'sample'})
    for i in range(10):
        sid='smp-s'+str(i);e=next(e for e in entities['enrollments'].values() if e['studentId']==sid)
        add('followups','smp-fu'+str(i),{'studentId':sid,'teacherId':e['teacherId'],'date':today.isoformat(),'type':'call',
            'reason':'risk','outcome':'تم التواصل — مكالمة تجريبية','by':'asst.mona'})
    ym=month_end.strftime('%Y-%m')
    for i in range(6):
        tid='smp-t'+str(i);teacher=entities['teachers'][tid];gids={gid for gid,g in entities['groups'].items() if g['teacherId']==tid and g['kind']!='school'}
        revenue=sum(p['amount'] for p in entities['payments'].values() if p.get('kind')=='fee' and p.get('groupId') in gids and p['date'].startswith(ym))
        held=[s for s in entities['sessions'].values() if s['groupId'] in gids and s['date'].startswith(ym)]
        visit_count=sum(1 for a in entities['attendance'].values() if a['groupId'] in gids and a['date'].startswith(ym) and a['status'] in D.ATT_PRESENT)
        share=D.center_share(teacher,revenue,len(held),visit_count)
        school_gids={gid for gid,g in entities['groups'].items() if g['teacherId']==tid and g['kind']=='school'}
        school_rev=sum(p['amount'] for p in entities['payments'].values() if p.get('kind')=='fee' and p.get('groupId') in school_gids and p['date'].startswith(ym))
        school=D.school_split(school_rev,D.DEFAULTS['schoolTreasuryPct'],D.DEFAULTS['schoolTeacherPct'])
        add('settlements',D.settlement_id(tid,ym),{'teacherId':tid,'period':ym,'revenue':round(revenue,2),'centerShare':share,
            'teacherShare':round(revenue-share+school['teacher'],2),'deductions':0,'paid':500,'status':'approved','by':'owner','at':month_end.isoformat()+'T22:00:00',
            'detail':{'sessions':len(held),'visits':visit_count,'school':school,'sample':True}})
    return ops


ACCOUNT_SPECS = [('owner','Centre manager','full-access',None), ('desk1','Sample front desk 1','secretary',None),
                 ('desk2','Sample front desk 2','secretary',None), ('t.ahmed','Sample teacher','teacher',['smp-t4']),
                 ('asst.mona','Sample assistant','assistant',['smp-t4'])]
ACCOUNT_MARKER = 'smp-account: fictional demo account'


def load(ctx, auth, actor):
    """Append sample data once, without overwriting real rows or accounts."""
    from center import Problem
    ctx.need('data.import'); ctx.need('users.manage')
    if ctx.scopes is not None: raise Problem('err.scope','Sample data requires access to all teachers.')
    if not auth.node.is_authority:
        from auth import NotAuthority
        raise NotAuthority(auth.authority_hint())
    with ctx.store.lock:
        if ctx.store.row('settings','smp-centre'):
            return {'already':True,'changes':0,'students':420}
        with auth.lock:
            existing={r['username']:dict(r) for r in auth.conn.execute('SELECT id,username,notes,deleted,active FROM users')}
        for username,_,_,_ in ACCOUNT_SPECS:
            if username in existing and (existing[username].get('notes')!=ACCOUNT_MARKER or existing[username]['deleted']):
                raise Problem('err.sampleAccount','A sample username is already used by another account.',name=username)
        user_ids={};profiles={p['id']:p for p in auth.profiles()}
        for username,name,profile,scopes in ACCOUNT_SPECS:
            if username in existing and existing[username]['active']:
                user_ids[username]=existing[username]['id'];continue
            old=auth.public(auth.get(existing[username]['id'])) if username in existing else {}
            saved=auth.save_user(actor,ctx.ip,{**old,'username':username,'full_name':name,'password':PASSWORD,
                'role':profiles[profile]['name'],'perms':profiles[profile]['perms'],'scopes':scopes,'active':True,
                'must_change':True,'notes':ACCOUNT_MARKER})
            if old: auth.reset_password(actor,ctx.ip,saved['id'],PASSWORD)
            user_ids[username]=saved['id']
        codes=[r[0] for r in ctx.store.conn.execute('SELECT code FROM students')]
        ops=build(used_codes=codes,user_ids=user_ids,node_id=ctx.node_id)
        result=ctx.store.commit(ctx.user,ctx.ip,'Sample centre',ops,force=True,user_id=ctx.user_id)
        ctx.store.mark_initialized()
        return {**result,'already':False,'students':420,'groups':24,'accounts':[a[0] for a in ACCOUNT_SPECS]}


def remove(ctx, auth, actor):
    """Soft-delete generated sample rows and disable explicitly marked demo accounts."""
    from center import Problem
    from store import ENTITIES
    ctx.need('data.import');ctx.need('users.manage')
    if ctx.scopes is not None: raise Problem('err.scope','Sample data requires access to all teachers.')
    if not auth.node.is_authority:
        from auth import NotAuthority
        raise NotAuthority(auth.authority_hint())
    with ctx.store.lock:
        ops=[]
        for entity,(table,_,_) in ENTITIES.items():
            for rid,ver in ctx.store.conn.execute(f"SELECT id,ver FROM {table} WHERE deleted=0 AND substr(id,1,4)='smp-'"):
                ops.append({'e':entity,'id':rid,'op':'del','ver':ver})
        result=ctx.store.commit(ctx.user,ctx.ip,'Delete all sample data',ops,force=True,user_id=ctx.user_id) if ops else {'changes':0}
        with auth.lock:
            users=[r[0] for r in auth.conn.execute('SELECT id FROM users WHERE deleted=0 AND active=1 AND notes=?',(ACCOUNT_MARKER,))]
        for uid in users: auth.save_user(actor,ctx.ip,{**auth.public(auth.get(uid)),'active':False})
        return {**result,'accountsRemoved':len(users)}
