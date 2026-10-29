"""Annotate striff-lib's diagram of the invented acme/checkout-service #418 for the homepage:
data-rules on what each rule is about, the broken composition in red, legacy marked off limits.

The diagram is striff-lib's own output for base/ and head/ here (an invented change that adds
CsvExporter, which holds a legacy PriceCalculator). To rebuild it, from a built striff-lib:

  java -cp "$STRIFF_LIB/target/classes:$(cat cp.txt)" Gen.java base head .
  python3 annotate.py acme-418-0.svg ../../src/assets/examples/acme-418-diagram.svg

where cp.txt is striff-lib's `mvn dependency:build-classpath` output. The element ids below
(lnk12, ent0010, ...) are the ones that run produced; check them if the engine changes.
"""
import re, sys
src, out = sys.argv[1], sys.argv[2]
s = open(src).read()
s = re.sub(r'^<\?plantuml[^>]*\?>', '', s)
# responsive root
s = re.sub(r'<svg ([^>]*?)height="[^"]*" ([^>]*?)style="[^"]*" ([^>]*?)width="[^"]*" ', r'<svg \1\2\3', s, count=1)
s = s.replace('<svg ', '<svg class="sd" role="img" aria-labelledby="sd-title" ', 1)
rules = {
  'lnk12': '1', 'ent0010': '1', 'ent0009': '1', 'lnk13': '1',
  'ent0004': '1 2', 'ent0006': '1 3', 'ent0005': '3',
  'lnk14': '2', 'ent0008': '2 4', 'ent0007': '4', 'lnk11': '',
}
for el, r in rules.items():
    s, n = re.subn(r'(<g class="(?:link|entity|cluster)"[^>]*\bid="%s")' % el, r'\1 data-rules="%s"' % r, s)
    assert n == 1, el
s = s.replace('<g class="link" data-entity-1="ent0006" data-entity-2="ent0010"', '<g class="link sd-broken" data-entity-1="ent0006" data-entity-2="ent0010"')
s = s.replace('id="ent0009"', 'id="ent0009"', 1)
s = re.sub(r'(<g class="cluster")([^>]*id="ent0009")', r'\1 data-forbidden="true"\2', s)
m = re.search(r'<g class="link sd-broken"[^>]*>.*?<path d="([^"]+)"', s, re.S)
d = m.group(1)
overlay = f'''<title id="sd-title">Striff's diagram of pull request 418: the new CsvExporter in checkout.export holds a PriceCalculator from legacy.pricing, which AGENTS.md line 18 puts off limits, so rule 1 is broken.</title>
<g class="sd-overlay">
<path class="sd-glow" d="{d}"/>
<path class="sd-draw" pathLength="1" d="{d}"/>
<rect class="sd-target" x="31.5" y="710" width="336.7" height="115.2" rx="6"/>
<text class="sd-note" x="366" y="702">off limits · AGENTS.md:18</text>
<g class="sd-badge"><circle cx="200" cy="585" r="13"/><text x="200" y="590">1</text></g>
<g class="sd-callout"><rect x="52" y="572" width="128" height="26" rx="13"/><text x="116" y="589">breaks rule 1</text></g>
</g>'''
s = s.replace('</svg>', overlay + '</svg>')
open(out, 'w').write(s)
print(len(s))
