"""AI question generator (review G04, plan P9.2) - optional, off until the owner pastes an API key.

* The key lives in ai.json in this PC's data folder (like gateway.json): never in the shared database, never in a log, never
  sent to a page (the settings page sees only "configured" and the last four characters).
* Only the subject, the grade, the lesson and the teacher's notes are sent - never a student, a parent or a mark.
* Nothing is saved here: the questions come back to the page, the teacher checks each one and adds it to the bank.
* Calls the Claude Messages API with the standard library (the server uses no outside packages), structured JSON output, and
  every failure is a clear message key: no key, key refused, no internet, busy, declined, cut short.
"""
import json
import os
import socket
import sys
import urllib.error
import urllib.request

import center

API_URL = 'https://api.anthropic.com'


def api_url():
    """Tests point HS_AI_URL at a local stand-in; never in Hessa.exe, where it could send the centre's AI key elsewhere."""
    if '__compiled__' in globals() or getattr(sys, 'frozen', False):
        return API_URL
    return os.environ.get('HS_AI_URL', API_URL)
MODEL = 'claude-sonnet-5-5'          # the plan's choice (P9.2); checked against the current model list on 2026-10-06
MAX_COUNT = 20
GRADE_NAMES = {'P1': 'Primary 1', 'P2': 'Primary 2', 'P3': 'Primary 3', 'P4': 'Primary 4', 'P5': 'Primary 5', 'P6': 'Primary 6',
               'M1': 'Preparatory 1', 'M2': 'Preparatory 2', 'M3': 'Preparatory 3',
               'S1': 'Secondary 1', 'S2': 'Secondary 2', 'S3': 'Secondary 3'}
SCHEMA = {
    'type': 'object', 'additionalProperties': False, 'required': ['questions'],
    'properties': {'questions': {'type': 'array', 'items': {
        'type': 'object', 'additionalProperties': False, 'required': ['text', 'choices', 'answer', 'explanation'],
        'properties': {'text': {'type': 'string'}, 'choices': {'type': 'array', 'items': {'type': 'string'}},
                       'answer': {'type': 'string', 'enum': ['A', 'B', 'C', 'D', 'E']}, 'explanation': {'type': 'string'}}}}},
}
SYSTEM = ("You write multiple-choice questions for teachers at a private tutoring centre in Egypt. Follow the Egyptian Ministry "
          "of Education curriculum for the grade and subject given. Each question has exactly four choices, one of them right; "
          "the letter of the right one is A, B, C or D, and the right letters are spread across the set. Questions must be "
          "self-contained (no figures), correct, unambiguous and at the level of the grade; mix recall, understanding and "
          "application. The explanation says in one or two sentences why the answer is right. Write in the language asked for.")


class Key:
    """ai.json: {key, model}. Read on every use so a key saved on this PC works at once."""

    def __init__(self, path):
        self.path = path

    def data(self):
        try:
            with open(self.path, encoding='utf-8') as f:
                d = json.load(f)
            return d if isinstance(d, dict) else {}
        except (OSError, ValueError):
            return {}

    def status(self):
        k = self.data().get('key') or ''
        return {'configured': bool(k), 'ends': k[-4:] if k else '', 'model': MODEL}

    def save(self, key):
        key = str(key or '').strip()
        if not key.startswith('sk-ant-') or len(key) < 30 or any(c.isspace() for c in key):
            raise center.Problem('ai.err.keyShape', 'This does not look like an Anthropic API key (it starts with sk-ant-).')
        tmp = self.path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump({'key': key}, f)
        try:
            os.chmod(tmp, 0o600)
        except OSError:
            pass
        os.replace(tmp, self.path)

    def clear(self):
        try:
            os.remove(self.path)
        except OSError:
            pass


def build_prompt(subject, grade, topic, count, lang, notes):
    words = 'Arabic (Modern Standard Arabic)' if lang == 'ar' else 'English'
    lines = [f'Subject: {subject or "not given"}', f'Grade: {GRADE_NAMES.get(grade, grade or "not given")}', f'Lesson or topic: {topic}',
             f'Number of questions: {count}', f'Language: {words}']
    if notes:
        lines.append(f"The teacher's notes: {notes}")
    return '\n'.join(lines)


def generate(key_store, subject, grade, topic, count, lang, notes, timeout=120):
    """Returns a list of clean questions ({text, choices, answer, explanation}); raises center.Problem with a message key."""
    key = key_store.data().get('key')
    if not key:
        raise center.Problem('ai.err.noKey', 'The AI question generator is not set up on this PC.')
    topic, notes = str(topic or '').strip()[:300], str(notes or '').strip()[:600]
    if not topic:
        raise center.Problem('ai.err.topic', 'Write the lesson or topic.')
    count = max(1, min(MAX_COUNT, int(count or 5)))
    body = {'model': MODEL, 'max_tokens': 16000, 'system': SYSTEM, 'fallbacks': 'default',
            'output_config': {'effort': 'high', 'format': {'type': 'json_schema', 'schema': SCHEMA}},
            'messages': [{'role': 'user', 'content': build_prompt(subject, grade, topic, count, 'en' if lang == 'en' else 'ar', notes)}]}
    req = urllib.request.Request(api_url().rstrip('/') + '/v1/messages', data=json.dumps(body).encode(), method='POST', headers={
        'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            res = json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        try:
            said = e.read() or b''
        except OSError:
            said = b''
        if e.code in (401, 403):
            raise center.Problem('ai.err.key', 'The AI service refused the key. Check it in Settings.')
        if e.code == 429 or e.code == 529:
            raise center.Problem('ai.err.busy', 'The AI service is busy. Try again in a minute.')
        if e.code == 402 or b'credit' in said.lower():
            raise center.Problem('ai.err.credit', 'The AI account has no credit left.')
        raise center.Problem('ai.err.other', 'The AI service answered with an error ({code}).', code=e.code)
    except (urllib.error.URLError, socket.timeout, TimeoutError, OSError):
        raise center.Problem('ai.err.offline', 'The AI service cannot be reached. Check the internet on this PC.')
    except ValueError:
        raise center.Problem('ai.err.other', 'The AI service answered with an error ({code}).', code='json')
    stop = res.get('stop_reason')
    if stop == 'refusal':
        raise center.Problem('ai.err.refused', 'The AI service declined this request. Change the topic or the notes.')
    if stop == 'max_tokens':
        raise center.Problem('ai.err.cut', 'The answer was cut short. Ask for fewer questions.')
    text = ''.join(b.get('text', '') for b in res.get('content') or [] if b.get('type') == 'text')
    try:
        items = json.loads(text)['questions']
    except (ValueError, KeyError, TypeError):
        raise center.Problem('ai.err.other', 'The AI service answered with an error ({code}).', code='format')
    out = []
    for q in items if isinstance(items, list) else []:
        try:
            out.append(center._clean_question(q))
        except center.Problem:
            continue                   # a broken question is dropped, never "fixed" by guessing
    if not out:
        raise center.Problem('ai.err.other', 'The AI service answered with an error ({code}).', code='empty')
    return out[:count]
