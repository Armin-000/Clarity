"""Mocked Web Speech smoke test; does NOT test a real Android microphone."""
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
html = re.sub(r'<script\s+src="[^"]+"\s*></script>', '', (root/'build/index.html').read_text())
with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for label, agent, short_session in [
        ('Android Chrome', 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36', True),
        ('iPhone Safari', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', True),
        ('Desktop Chrome', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', False)
    ]:
        ctx=browser.new_context(user_agent=agent, viewport={'width':390 if short_session else 1320, 'height':844})
        fakeScript = ('''(() => {
          window.__speechInstances = [];
          window.__captureCalls = 0;
          class FakeRecognition {
            constructor() { window.__speechInstances.push(this); }
            start() { this._started = true; queueMicrotask(() => this.onstart?.({})); }
            stop() { queueMicrotask(() => this.onend?.({})); }
            abort() { queueMicrotask(() => this.onend?.({})); }
            send(text, final=true, index=0) {
              const choice=[{ transcript:text, confidence:.85 }, { transcript:'PREPRAVLJENO',confidence:.99 }];
              choice.isFinal=final;
              const results = Array.from({length:index+1}, () => [{transcript:'', confidence:0}]);
              results[index] = choice;
              this.onresult?.({ resultIndex:index, results });
            }
            fail(code) { this.onerror?.({error:code}); }
          }
          window.SpeechRecognition = FakeRecognition;
          window.webkitSpeechRecognition = FakeRecognition;
          Object.defineProperty(navigator, 'mediaDevices', { configurable:true,
            value: { getUserMedia: async () => {window.__captureCalls++; throw Error('Second mic');} } });
          const hook = () => {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
              const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
              navigator.mediaDevices.getUserMedia=(...a)=>{window.__captureCalls++; return original(...a);};
            }
          };
          hook();
        })();''')
        page=ctx.new_page()
        errors=[]
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.set_content(html, wait_until='load')
        page.evaluate(fakeScript)
        for source in ['clarity-speech-bridge.js', 'modules/transcript-core.js', 'app.js']:
            page.add_script_tag(content=(root/'build'/source).read_text())
        page.wait_for_function('!document.querySelector("#recordButton").disabled')
        page.locator('#recordButton').click()
        page.wait_for_function('window.__speechInstances.length >= 1')
        page.wait_for_timeout(100)
        vals = page.evaluate('''() => ({ count: window.__speechInstances.length, continuous: window.__speechInstances[0].continuous,
          maxAlternatives: window.__speechInstances[0].maxAlternatives,
          captureCalls: window.__captureCalls,
          dock: document.querySelector('#dockStatus').textContent })''')
        assert vals['captureCalls']==0, (label,'Unexpected second mic', vals)
        assert vals['maxAlternatives']==1, (label,vals)
        assert vals['continuous']==(not short_session), (label,vals)
        assert vals['dock'] in ['Slušam','Listening'], (label,vals)
        # The interim is visible without mutating dialect or case.
        page.evaluate('window.__speechInstances.at(-1).send("ovde sam", false)')
        page.wait_for_function('document.querySelector("#interimText").textContent.includes("ovde sam")')
        # Two final results + one repeated browser final event on the same index.
        page.evaluate('''() => {
          const r=window.__speechInstances.at(-1);
          r.send('šta je ovo',true,0);
          r.send('šta je ovo',true,0);
          r.send('Da',true,1);
        }''')
        page.locator('#recordButton').click()
        page.wait_for_timeout(200)
        output=page.locator('#transcriptStream').inner_text()
        assert 'šta je ovo' in output, (label,output)
        assert 'PREPRAVLJENO' not in output and 'što je ovo' not in output, (label,output)
        assert output.count('šta je ovo')==1, (label,output)
        assert 'Da' in output, (label,output)
        assert not errors, (label,errors)
        # A permission error after recognized speech must keep existing transcript.
        page.locator('#recordButton').click()
        page.wait_for_function('window.__speechInstances.length >= 2')
        page.evaluate("""() => {
          const r = window.__speechInstances.at(-1);
          r.send('Provjera sačuvana', true, 0);
          r.fail('not-allowed');
        }""")
        page.wait_for_function('document.querySelector("#dockStatus").textContent === "Prekinuto"')
        assert 'Provjera sačuvana' in page.locator('#transcriptStream').inner_text(), (label,'Lost transcript on error')
        assert not errors, (label,errors)
        print(f'{label}: start, one STT engine, interim, primary final, dedupe, Stop, error preserves text OK')
        ctx.close()
    browser.close()
