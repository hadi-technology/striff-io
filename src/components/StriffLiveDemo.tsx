import { useState, useEffect, useRef, useCallback } from "react";
import { SVG_CONTENT_BOUNDS, createViewportForBounds } from "./striffViewport.js";

const ff="-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif,'Apple Color Emoji','Segoe UI Emoji'";
const mono="ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function zoomTransformAroundPoint(
  transform: { scale: number; x: number; y: number },
  point: { x: number; y: number },
  zoomFactor: number,
  bounds: { minScale: number; maxScale: number },
) {
  const safeScale = transform.scale || 1;
  const nextScale = clamp(safeScale * zoomFactor, bounds.minScale, bounds.maxScale);
  const contentX = (point.x - transform.x) / safeScale;
  const contentY = (point.y - transform.y) / safeScale;
  return {
    scale: nextScale,
    x: point.x - contentX * nextScale,
    y: point.y - contentY * nextScale,
  };
}

function Cursor({x,y,clicking,vis,grabbing}:{x:number;y:number;clicking:boolean;vis:boolean;grabbing:boolean}){
  if(!vis) return null;
  return (
    <div
      style={{
        position:"absolute",
        left:x,
        top:y,
        zIndex:260,
        pointerEvents:"none",
        transition:"left .45s cubic-bezier(.4,0,.2,1),top .45s cubic-bezier(.4,0,.2,1)",
      }}
    >
      <svg
        width="18"
        height="22"
        viewBox="0 0 17 21"
        style={{filter:"drop-shadow(1px 2px 2px rgba(0,0,0,.25))"}}
      >
        <path
          d="M1 1v17l4.3-4.3a.5.5 0 01.36-.15h6.9L1 1z"
          fill="#fff"
          stroke="#0f172a"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
        {grabbing && (
          <circle cx="6" cy="14.5" r="2.2" fill="rgba(15,23,42,.12)" />
        )}
      </svg>
      {clicking && (
        <div
          style={{
            position:"absolute",
            left:1,
            top:1,
            width:10,
            height:10,
            borderRadius:"50%",
            border:"2px solid rgba(9,105,218,.65)",
            animation:"ring .35s ease-out forwards",
          }}
        />
      )}
    </div>
  );
}

const tree=[
  {dir:"pydantic",files:[{name:"fields.py",ents:["pydantic.module:fields","pydantic.fields.FieldInfo","pydantic.fields._FromFieldInfoInputs","pydantic.fields.FieldComparable"]}]},
  {dir:"pydantic/_internal",files:[{name:"_generate_schema.py",ents:["pydantic._internal.module:_generate_schema","pydantic._internal._generate_schema.GenerateSchema"]}]},
  {dir:"pydantic-core",files:[{name:"core_schema.pyi",ents:["pydantic-core.python.pydantic_core.module:core_schema"]}]},
  {dir:"tests",files:[{name:"test_main.py",ents:["tests.module:test_main"]}]},
];
const ent2file={};tree.forEach(g=>g.files.forEach(f=>f.ents.forEach(e=>{ent2file[e]=f.name})));

const entityFocus={
  "pydantic.module:fields":{file:"fields.py",start:0,end:13,label:"fields.py module diff"},
  "pydantic.fields.FieldInfo":{file:"fields.py",start:3,end:13,label:"FieldInfo diff"},
  "pydantic.fields._FromFieldInfoInputs":{file:"fields.py",start:3,end:13,label:"FieldInfo-related diff"},
  "pydantic.fields.FieldComparable":{file:"fields.py",start:8,end:13,label:"FieldComparable diff"},
  "pydantic._internal._generate_schema.GenerateSchema":{file:"_generate_schema.py",start:3,end:9,label:"GenerateSchema diff"},
  "pydantic._internal.module:_generate_schema":{file:"_generate_schema.py",start:3,end:9,label:"_generate_schema diff"},
  "pydantic-core.python.pydantic_core.module:core_schema":{file:"core_schema.pyi",start:2,end:7,label:"core_schema diff"},
  "tests.module:test_main":{file:"test_main.py",start:0,end:12,label:"test_main diff"},
};

const allDiffs=[
  {path:"pydantic/fields.py",name:"fields.py",lines:[
    {o:88,n:88,c:"class FieldInfo:",t:0},{o:89,n:89,c:'    """This class holds information about a field."""',t:0},
    {o:90,n:90,c:"",t:0},{o:null,n:91,c:"    compare_as: Callable[[Any, Any], bool] | None = None",t:1},
    {o:null,n:92,c:"",t:1},{o:null,n:93,c:"    def get_comparable(self, value) -> FieldComparable | Any:",t:1},
    {o:null,n:94,c:"        if self.compare_as is not None:",t:1},
    {o:null,n:95,c:"            return FieldComparable(value, self.compare_as)",t:1},
    {o:null,n:96,c:"        return value",t:1},{o:91,n:97,c:"",t:0},
    {o:null,n:98,c:"class FieldComparable:",t:1},
    {o:null,n:99,c:'    """Wrapper for custom field comparison"""',t:1},
    {o:null,n:100,c:"    def __init__(self, value, compare_as):",t:1},
    {o:null,n:101,c:"        self.value = value",t:1},
    {o:null,n:102,c:"        self.compare_as = compare_as",t:1},
  ]},
  {path:"pydantic/_internal/_generate_schema.py",name:"_generate_schema.py",lines:[
    {o:1842,n:1842,c:"    class GenerateSchema:",t:0},
    {o:1843,n:null,c:"        def _generate_td_field_schema(self, ...):",t:-1},
    {o:1844,n:null,c:"            return core_schema.typed_dict_field(schema)",t:-1},
    {o:null,n:1843,c:"        def _generate_td_field_schema(",t:1},
    {o:null,n:1844,c:"            self, name: str, field_info: FieldInfo,",t:1},
    {o:null,n:1845,c:"        ) -> core_schema.TypedDictField:",t:1},
    {o:null,n:1846,c:"            schema = self._common_field(field_info)",t:1},
    {o:null,n:1847,c:"            if field_info.compare_as is not None:",t:1},
    {o:null,n:1848,c:"                schema['compare_as'] = field_info.compare_as",t:1},
    {o:null,n:1849,c:"            return core_schema.typed_dict_field(schema)",t:1},
  ]},
  {path:"pydantic-core/core_schema.pyi",name:"core_schema.pyi",lines:[
    {o:320,n:320,c:"def typed_dict_field(",t:0},{o:321,n:321,c:"    schema: CoreSchema,",t:0},
    {o:null,n:322,c:"    compare_as: Callable[..., Any] | None = None,",t:1},
    {o:322,n:323,c:"    *,",t:0},{o:323,n:324,c:"    required: bool | None = None,",t:0},
    {o:340,n:341,c:"def dataclass_field(",t:0},{o:341,n:342,c:"    schema: CoreSchema,",t:0},
    {o:null,n:343,c:"    compare_as: Callable[..., Any] | None = None,",t:1},{o:342,n:344,c:"    *,",t:0},
  ]},
  {path:"tests/test_main.py",name:"test_main.py",lines:[
    {o:null,n:1,c:"import pytest",t:1},{o:null,n:2,c:"from pydantic import BaseModel, Field",t:1},
    {o:null,n:3,c:"",t:1},{o:null,n:4,c:"def test_eq_binary_compare_as():",t:1},
    {o:null,n:5,c:"    class MyModel(BaseModel):",t:1},
    {o:null,n:6,c:'        name: str = Field(compare_as=lambda a,b: a.lower()==b.lower())',t:1},
    {o:null,n:7,c:"",t:1},{o:null,n:8,c:'    assert MyModel(name="Alice")==MyModel(name="ALICE")',t:1},
    {o:null,n:9,c:"",t:1},{o:null,n:10,c:"def test_eq_unary_compare_as():",t:1},
    {o:null,n:11,c:"    class MyModel(BaseModel):",t:1},
    {o:null,n:12,c:"        name: str = Field(compare_as=str.lower)",t:1},
  ]},
];

const SVG=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" contentstyletype="text/css" data-diagram-type="CLASS"  preserveAspectRatio="xMidYMid meet" version="1.1" viewBox="0 0 1800 1400" width="100%" zoomAndPan="magnify"><defs><filter height="1" id="b1ogjyv1ulfx4v0" width="1" x="0" y="0"><feFlood flood-color="#BEF5CB" result="flood"/><feComposite in="SourceGraphic" in2="flood" operator="over"/></filter><filter height="1" id="b1ogjyv1ulfx4v1" width="1" x="0" y="0"><feFlood flood-color="#FDAEB7" result="flood"/><feComposite in="SourceGraphic" in2="flood" operator="over"/></filter><filter height="1" id="b1ogjyv1ulfx4v2" width="1" x="0" y="0"><feFlood flood-color="#E6E6E6" result="flood"/><feComposite in="SourceGraphic" in2="flood" operator="over"/></filter><filter height="1" id="b1ogjyv1ulfx4v3" width="1" x="0" y="0"><feFlood flood-color="#B3E3F5" result="flood"/><feComposite in="SourceGraphic" in2="flood" operator="over"/></filter></defs><g><rect fill="#F8F8F8" height="1133" style="stroke:none;stroke-width:1;" width="1563" x="0" y="0"/><g class="cluster" data-qualified-name="pkg_pydantic_2384eaa6" data-source-line="71" id="ent0002"><path d="M16.5,4 L73.7518,4 A3.75,3.75 0 0 1 76.2518,6.5 L83.2518,29.0679 L911.5,29.0679 A2.5,2.5 0 0 1 914,31.5679 L914,1091.5 A2.5,2.5 0 0 1 911.5,1094 L16.5,1094 A2.5,2.5 0 0 1 14,1091.5 L14,6.5 A2.5,2.5 0 0 1 16.5,4" fill="#F0FFFA" style="stroke:#E0E0E0;stroke-width:1;"/><line style="stroke:#E0E0E0;stroke-width:1;" x1="14" x2="83.2518" y1="29.0679" y2="29.0679"/><text fill="#24292E" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="56.2518" x="18" y="20.9659">pydantic</text></g><g class="cluster" data-qualified-name="pkg_pydantic_2384eaa6.pkg_pydantic__internal_32cb9ed4" data-source-line="123" id="ent0007"><path d="M176.5,78.5 L234.8298,78.5 A3.75,3.75 0 0 1 237.3298,81 L244.3298,103.5679 L903.5,103.5679 A2.5,2.5 0 0 1 906,106.0679 L906,285 A2.5,2.5 0 0 1 903.5,287.5 L176.5,287.5 A2.5,2.5 0 0 1 174,285 L174,81 A2.5,2.5 0 0 1 176.5,78.5" fill="#F9FFF0" style="stroke:#E0E0E0;stroke-width:1;"/><line style="stroke:#E0E0E0;stroke-width:1;" x1="174" x2="244.3298" y1="103.5679" y2="103.5679"/><text fill="#24292E" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="57.3298" x="178" y="95.4659">_internal</text></g><g class="cluster" data-qualified-name="pkg_pydantic_core_python_pydantic_core_a2c78a8e" data-source-line="138" id="ent0010"><path d="M924.5,80 L1160.5451,80 A3.75,3.75 0 0 1 1163.0451,82.5 L1170.0451,105.0679 L1191.5,105.0679 A2.5,2.5 0 0 1 1194,107.5679 L1194,283.5 A2.5,2.5 0 0 1 1191.5,286 L924.5,286 A2.5,2.5 0 0 1 922,283.5 L922,82.5 A2.5,2.5 0 0 1 924.5,80" fill="#F0FFFD" style="stroke:#E0E0E0;stroke-width:1;"/><line style="stroke:#E0E0E0;stroke-width:1;" x1="922" x2="1170.0451" y1="105.0679" y2="105.0679"/><text fill="#24292E" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="235.0451" x="926" y="96.9659">pydantic-core.python.pydantic_core</text></g><g class="cluster" data-qualified-name="pkg_tests_6924e21" data-source-line="148" id="ent0012"><path d="M1204.5,99 L1236.9159,99 A3.75,3.75 0 0 1 1239.4159,101.5 L1246.4159,124.0679 L1553.5,124.0679 A2.5,2.5 0 0 1 1556,126.5679 L1556,264.5 A2.5,2.5 0 0 1 1553.5,267 L1204.5,267 A2.5,2.5 0 0 1 1202,264.5 L1202,101.5 A2.5,2.5 0 0 1 1204.5,99" fill="#F0F1FF" style="stroke:#E0E0E0;stroke-width:1;"/><line style="stroke:#E0E0E0;stroke-width:1;" x1="1202" x2="1246.4159" y1="124.0679" y2="124.0679"/><text fill="#24292E" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="31.4159" x="1206" y="115.9659">tests</text></g><g class="entity" data-qualified-name="pydantic.module:fields" data-source-line="72" id="ent0003" style="fill: var(--fgColor-accent, var(--color-accent-fg, #0969da)); cursor: pointer"><rect fill="#F8F8F8" height="320.3629" rx="2.5" ry="2.5" style="stroke:#24292E;stroke-width:1;" width="141.0176" x="22.5" y="34"/><rect fill="#24292E" height="45.412" rx="2.5" ry="2.5" style="stroke:#24292E;stroke-width:1;" width="141.0176" x="22.5" y="34"/><rect fill="#24292E" height="2.5" style="stroke:#24292E;stroke-width:1;" width="141.0176" x="22.5" y="76.912"/><rect fill="none" height="320.3629" rx="2.5" ry="2.5" style="stroke:#24292E;stroke-width:1;" width="141.0176" x="22.5" y="34"/><ellipse cx="37.5" cy="56.706" fill="#C0C0C0" rx="11" ry="11" style="stroke:#181818;stroke-width:1;"/><path d="M33.2188,50.3154 L36.1406,50.3154 L37.6094,55.7529 L39.0781,50.3154 L42.0156,50.3154 L42.0156,62.706 L39.9063,62.706 L39.9063,52.7841 L38.5938,58.206 L36.6563,58.206 L35.3281,52.7841 L35.3281,62.706 L33.2188,62.706 L33.2188,50.3154 Z " fill="#000000"/><text fill="#C0C0C0" font-family="Consolas,Menlo,Liberation Mono" font-size="12" font-style="italic" lengthAdjust="spacing" textLength="58.6204" x="76.6986" y="51.8281">«synthetic»</text><text fill="#FFDEAD" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="43.4978" x="51.5" y="70.31">fields [</text><text fill="#BEF5CB" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="16.0159" x="98.6378" y="70.31">+7</text><text fill="#FFDEAD" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="3.64" x="114.6537" y="70.31"> </text><text fill="#FDAEB7" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="12.5159" x="118.2937" y="70.31">-7</text><text fill="#FFDEAD" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="4.606" x="130.8097" y="70.31">]</text><text fill="#FFDEAD" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="21.4619" x="139.0556" y="70.31">(...)</text><line style="stroke:#24292E;stroke-width:1;" x1="23.5" x2="162.5176" y1="79.412" y2="79.412"/><g data-visibility-modifier="PACKAGE_PRIVATE_METHOD"><polygon fill="#E0E0E0" points="33.5,90.446,29.5,96.446,37.5,96.446" style="stroke:#E0E0E0;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v0)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="75.6837" x="42.5" y="98.378">Field(...) : _T</text><g data-visibility-modifier="PACKAGE_PRIVATE_METHOD"><polygon fill="#E0E0E0" points="33.5,109.5139,29.5,115.5139,37.5,115.5139" style="stroke:#E0E0E0;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v0)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="75.6837" x="42.5" y="117.4459">Field(...) : _T</text><g data-visibility-modifier="PACKAGE_PRIVATE_METHOD"><polygon fill="#E0E0E0" points="33.5,128.5818,29.5,134.5818,37.5,134.5818" style="stroke:#E0E0E0;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v0)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="86.4216" x="42.5" y="136.5138">Field(...) : Any</text><g data-visibility-modifier="PACKAGE_PRIVATE_METHOD"><polygon fill="#E0E0E0" points="33.5,147.6497,29.5,153.6497,37.5,153.6497" style="stroke:#E0E0E0;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v1)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="75.6837" x="42.5" y="155.5817">Field(...) : _T</text><g data-visibility-modifier="PACKAGE_PRIVATE_METHOD"><polygon fill="#E0E0E0" points="33.5,166.7177,29.5,172.7177,37.5,172.7177" style="stroke:#E0E0E0;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v1)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="86.4216" x="42.5" y="174.6496">Field(...) : Any</text><g data-visibility-modifier="PACKAGE_PRIVATE_METHOD"><polygon fill="#E0E0E0" points="33.5,185.7856,29.5,191.7856,37.5,191.7856" style="stroke:#E0E0E0;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v0)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="86.4216" x="42.5" y="193.7176">Field(...) : Any</text><g data-visibility-modifier="PACKAGE_PRIVATE_METHOD"><polygon fill="#E0E0E0" points="33.5,204.8535,29.5,210.8535,37.5,210.8535" style="stroke:#E0E0E0;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v1)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="86.4216" x="42.5" y="212.7855">Field(...) : Any</text><g data-visibility-modifier="PACKAGE_PRIVATE_METHOD"><polygon fill="#E0E0E0" points="33.5,223.9214,29.5,229.9214,37.5,229.9214" style="stroke:#E0E0E0;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v0)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="86.4216" x="42.5" y="231.8534">Field(...) : Any</text><g data-visibility-modifier="PACKAGE_PRIVATE_METHOD"><polygon fill="#E0E0E0" points="33.5,242.9893,29.5,248.9893,37.5,248.9893" style="stroke:#E0E0E0;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v1)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="86.4216" x="42.5" y="250.9213">Field(...) : Any</text><g data-visibility-modifier="PACKAGE_PRIVATE_METHOD"><polygon fill="#E0E0E0" points="33.5,262.0572,29.5,268.0572,37.5,268.0572" style="stroke:#E0E0E0;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v1)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="86.4216" x="42.5" y="269.9892">Field(...) : Any</text><g data-visibility-modifier="PACKAGE_PRIVATE_METHOD"><polygon fill="#E0E0E0" points="33.5,281.1252,29.5,287.1252,37.5,287.1252" style="stroke:#E0E0E0;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v1)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="86.4216" x="42.5" y="289.0571">Field(...) : Any</text><g data-visibility-modifier="PACKAGE_PRIVATE_METHOD"><polygon fill="#E0E0E0" points="33.5,300.1931,29.5,306.1931,37.5,306.1931" style="stroke:#E0E0E0;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v0)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="86.4216" x="42.5" y="308.1251">Field(...) : Any</text><g data-visibility-modifier="PACKAGE_PRIVATE_METHOD"><polygon fill="#E0E0E0" points="33.5,319.261,29.5,325.261,37.5,325.261" style="stroke:#E0E0E0;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v1)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="75.6837" x="42.5" y="327.193">Field(...) : _T</text><g data-visibility-modifier="PACKAGE_PRIVATE_METHOD"><polygon fill="#E0E0E0" points="33.5,338.3289,29.5,344.3289,37.5,344.3289" style="stroke:#E0E0E0;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v0)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="86.4216" x="42.5" y="346.2609">Field(...) : Any</text></g><g class="entity" data-qualified-name="pydantic.fields.FieldInfo" data-source-line="88" id="ent0004" style="fill: var(--fgColor-accent, var(--color-accent-fg, #0969da)); cursor: pointer"><rect fill="#F8F8F8" height="293.7471" rx="2.5" ry="2.5" style="stroke:#24292E;stroke-width:1;" width="564.284" x="159" y="390"/><rect fill="#24292E" height="32" rx="2.5" ry="2.5" style="stroke:#24292E;stroke-width:1;" width="564.284" x="159" y="390"/><rect fill="#24292E" height="2.5" style="stroke:#24292E;stroke-width:1;" width="564.284" x="159" y="419.5"/><rect fill="none" height="293.7471" rx="2.5" ry="2.5" style="stroke:#24292E;stroke-width:1;" width="564.284" x="159" y="390"/><ellipse cx="369.4193" cy="406" fill="#ADD1B2" rx="11" ry="11" style="stroke:#181818;stroke-width:1;"/><path d="M372.388,411.6406 Q371.8099,411.9375 371.1693,412.0781 Q370.5286,412.2344 369.8255,412.2344 Q367.3255,412.2344 365.9974,410.5938 Q364.6849,408.9375 364.6849,405.8125 Q364.6849,402.6875 365.9974,401.0313 Q367.3255,399.375 369.8255,399.375 Q370.5286,399.375 371.1693,399.5313 Q371.8255,399.6875 372.388,399.9844 L372.388,402.7031 Q371.763,402.125 371.1693,401.8594 Q370.5755,401.5781 369.9505,401.5781 Q368.6068,401.5781 367.9193,402.6563 Q367.2318,403.7188 367.2318,405.8125 Q367.2318,407.9063 367.9193,408.9844 Q368.6068,410.0469 369.9505,410.0469 Q370.5755,410.0469 371.1693,409.7813 Q371.763,409.5 372.388,408.9219 L372.388,411.6406 Z " fill="#000000"/><text fill="#FFDEAD" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="65.9258" x="389.9193" y="411.432">FieldInfo [</text><text fill="#BEF5CB" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="16.0159" x="459.485" y="411.432">+2</text><text fill="#FFDEAD" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="3.64" x="475.5009" y="411.432"> </text><text fill="#B3E3F5" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="16.0159" x="479.1409" y="411.432">+1</text><text fill="#FFDEAD" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="4.606" x="495.1568" y="411.432">]</text><text fill="#FFDEAD" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="21.4619" x="503.4028" y="411.432">(...)</text><line style="stroke:#24292E;stroke-width:1;" x1="160" x2="722.284" y1="422" y2="422"/><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="291.2829" x="165" y="440.9659">This class holds information about a field.</text><text fill="#000000" filter="url(#b1ogjyv1ulfx4v2)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="62.0898" x="459.9229" y="440.9659">FieldInfo</text><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="136.2335" x="525.6527" y="440.9659">is used for any field</text><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="261.9531" x="165" y="460.0339">definition regardless of whether the [</text><text fill="#000000" filter="url(#b1ogjyv1ulfx4v2)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="42.6299" x="426.9531" y="460.0339">Field[]</text><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="217.0413" x="469.5829" y="460.0339">][pydantic.fields.Field] function</text><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="226.1692" x="165" y="479.1018">is explicitly used. !!! warning The</text><text fill="#000000" filter="url(#b1ogjyv1ulfx4v2)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="62.0898" x="394.8092" y="479.1018">FieldInfo</text><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="169.2454" x="460.5389" y="479.1018">class is meant to expose</text><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="409.1484" x="165" y="498.1697">information about a field in a Pydantic model or dataclass.</text><text fill="#000000" filter="url(#b1ogjyv1ulfx4v2)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="62.0898" x="577.7884" y="498.1697">FieldInfo</text><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="552.284" x="165" y="517.2376">instances shouldn't be instantiated directly, nor mutated. If you need to derive</text><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="379.5806" x="165" y="536.3055">a new model from another one and are willing to alter</text><text fill="#000000" filter="url(#b1ogjyv1ulfx4v2)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="62.0898" x="548.2206" y="536.3055">FieldInfo</text><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="70.5737" x="613.9503" y="536.3055">instances,</text><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="509.4441" x="165" y="555.3734">refer to this [dynamic model example][../examples/dynamic_models.md].</text><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="532.8521" x="165" y="574.4414">Attributes: annotation: The type annotation of the field. default: The default</text><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="379.3425" x="165" y="593.5093">**value of the field. default_factory: A callable to genera...</text><line style="stroke:#24292E;stroke-width:1;" x1="160" x2="722.284" y1="601.6113" y2="601.6113"/><rect x="165" y="605.6113" width="92" height="18" rx="3" fill="#24292E" opacity="0.7"/><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="3.64" x="257" y="621.5093"> </text><rect x="260.64" y="605.6113" width="70" height="18" rx="3" fill="#24292E" opacity="0.7"/><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="3.64" x="330.64" y="621.5093"> </text><rect x="334.28" y="605.6113" width="54" height="18" rx="3" fill="#24292E" opacity="0.7"/><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="3.64" x="388.28" y="621.5093"> </text><rect x="391.92" y="605.6113" width="72" height="18" rx="3" fill="#24292E" opacity="0.7"/><line style="stroke:#24292E;stroke-width:1;" x1="160" x2="722.284" y1="629.6113" y2="629.6113"/><g data-visibility-modifier="PACKAGE_PRIVATE_FIELD"><polygon fill="none" points="170,640.6452,166,646.6452,174,646.6452" style="stroke:#E0E0E0;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v0)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="446.8083" x="179" y="648.5772">compare_as : Callable[[Any, Any], bool] | Callable[[Any], Any] | None</text><line style="stroke:#24292E;stroke-width:1;" x1="160" x2="722.284" y1="656.6792" y2="656.6792"/><g data-visibility-modifier="PACKAGE_PRIVATE_METHOD"><polygon fill="#E0E0E0" points="170,667.7131,166,673.7131,174,673.7131" style="stroke:#E0E0E0;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v0)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="344.3147" x="179" y="675.6451">get_comparable(value: Any) : FieldComparable | Any</text></g><g class="entity" data-qualified-name="pydantic.fields._FromFieldInfoInputs" data-source-line="105" id="ent0005" style="fill: var(--fgColor-accent, var(--color-accent-fg, #0969da)); cursor: pointer"><rect fill="#F8F8F8" height="133.2038" rx="2.5" ry="2.5" style="stroke:#24292E;stroke-width:1;" width="472.8083" x="204.5" y="953"/><rect fill="#24292E" height="32" rx="2.5" ry="2.5" style="stroke:#24292E;stroke-width:1;" width="472.8083" x="204.5" y="953"/><rect fill="#24292E" height="2.5" style="stroke:#24292E;stroke-width:1;" width="472.8083" x="204.5" y="982.5"/><rect fill="none" height="133.2038" rx="2.5" ry="2.5" style="stroke:#24292E;stroke-width:1;" width="472.8083" x="204.5" y="953"/><ellipse cx="337.3875" cy="969" fill="#ADD1B2" rx="11" ry="11" style="stroke:#181818;stroke-width:1;"/><path d="M340.3563,974.6406 Q339.7781,974.9375 339.1375,975.0781 Q338.4969,975.2344 337.7938,975.2344 Q335.2938,975.2344 333.9656,973.5938 Q332.6531,971.9375 332.6531,968.8125 Q332.6531,965.6875 333.9656,964.0313 Q335.2938,962.375 337.7938,962.375 Q338.4969,962.375 339.1375,962.5313 Q339.7938,962.6875 340.3563,962.9844 L340.3563,965.7031 Q339.7313,965.125 339.1375,964.8594 Q338.5438,964.5781 337.9188,964.5781 Q336.575,964.5781 335.8875,965.6563 Q335.2,966.7188 335.2,968.8125 Q335.2,970.9063 335.8875,971.9844 Q336.575,973.0469 337.9188,973.0469 Q338.5438,973.0469 339.1375,972.7813 Q339.7313,972.5 340.3563,971.9219 L340.3563,974.6406 Z " fill="#000000"/><text fill="#FFDEAD" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="149.1694" x="357.8875" y="974.432">_FromFieldInfoInputs [</text><text fill="#BEF5CB" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="16.0159" x="510.697" y="974.432">+1</text><text fill="#FFDEAD" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="4.606" x="526.7129" y="974.432">]</text><text fill="#FFDEAD" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="21.4619" x="534.9589" y="974.432">(...)</text><line style="stroke:#24292E;stroke-width:1;" x1="205.5" x2="676.3083" y1="985" y2="985"/><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="355.1227" x="210.5" y="1003.9659">This class exists solely to add type checking for the</text><text fill="#000000" filter="url(#b1ogjyv1ulfx4v2)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="51.2958" x="569.2627" y="1003.9659">kwargs</text><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="13.468" x="624.1984" y="1003.9659">in</text><text fill="#000000" filter="url(#b1ogjyv1ulfx4v2)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="137.1155" x="210.5" y="1023.0339">FieldInfo.from_field</text><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="3.99" x="347.6155" y="1023.0339">.</text><line style="stroke:#24292E;stroke-width:1;" x1="205.5" x2="676.3083" y1="1031.1358" y2="1031.1358"/><rect x="210.5" y="1035.1358" width="66" height="18" rx="3" fill="#24292E" opacity="0.7"/><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="3.64" x="276.5" y="1051.0339"> </text><rect x="280.14" y="1035.1358" width="60" height="18" rx="3" fill="#24292E" opacity="0.7"/><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="3.64" x="340.14" y="1051.0339"> </text><rect x="343.78" y="1035.1358" width="54" height="18" rx="3" fill="#24292E" opacity="0.7"/><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="3.64" x="397.78" y="1051.0339"> </text><rect x="401.42" y="1035.1358" width="58" height="18" rx="3" fill="#24292E" opacity="0.7"/><line style="stroke:#24292E;stroke-width:1;" x1="205.5" x2="676.3083" y1="1059.1358" y2="1059.1358"/><g data-visibility-modifier="PACKAGE_PRIVATE_FIELD"><polygon fill="none" points="215.5,1070.1698,211.5,1076.1698,219.5,1076.1698" style="stroke:#E0E0E0;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v0)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="446.8083" x="224.5" y="1078.1018">compare_as : Callable[[Any, Any], bool] | Callable[[Any], Any] | None</text></g><g class="entity" data-qualified-name="pydantic.fields.FieldComparable" data-source-line="113" id="ent0006" style="fill: var(--fgColor-accent, var(--color-accent-fg, #0969da)); cursor: pointer"><rect fill="#BEF5CB" height="160.2717" rx="2.5" ry="2.5" style="stroke:#24292E;stroke-width:1;" width="353.9627" x="460" y="720"/><rect fill="#24292E" height="32" rx="2.5" ry="2.5" style="stroke:#24292E;stroke-width:1;" width="353.9627" x="460" y="720"/><rect fill="#24292E" height="2.5" style="stroke:#24292E;stroke-width:1;" width="353.9627" x="460" y="749.5"/><rect fill="none" height="160.2717" rx="2.5" ry="2.5" style="stroke:#24292E;stroke-width:1;" width="353.9627" x="460" y="720"/><ellipse cx="560.6666" cy="736" fill="#ADD1B2" rx="11" ry="11" style="stroke:#181818;stroke-width:1;"/><path d="M563.6354,741.6406 Q563.0572,741.9375 562.4166,742.0781 Q561.776,742.2344 561.0729,742.2344 Q558.5729,742.2344 557.2447,740.5938 Q555.9322,738.9375 555.9322,735.8125 Q555.9322,732.6875 557.2447,731.0313 Q558.5729,729.375 561.0729,729.375 Q561.776,729.375 562.4166,729.5313 Q563.0729,729.6875 563.6354,729.9844 L563.6354,732.7031 Q563.0104,732.125 562.4166,731.8594 Q561.8229,731.5781 561.1979,731.5781 Q559.8541,731.5781 559.1666,732.6563 Q558.4791,733.7188 558.4791,735.8125 Q558.4791,737.9063 559.1666,738.9844 Q559.8541,740.0469 561.1979,740.0469 Q561.8229,740.0469 562.4166,739.7813 Q563.0104,739.5 563.6354,738.9219 L563.6354,741.6406 Z " fill="#000000"/><text fill="#FFDEAD" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="119.8676" x="581.1666" y="741.432">FieldComparable [</text><text fill="#BEF5CB" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="16.0159" x="704.6741" y="741.432">+4</text><text fill="#FFDEAD" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="4.606" x="720.6901" y="741.432">]</text><line style="stroke:#24292E;stroke-width:1;" x1="461" x2="812.9627" y1="752" y2="752"/><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="341.9627" x="466" y="770.9659">Wrapper for supporting custom field comparison</text><line style="stroke:#24292E;stroke-width:1;" x1="461" x2="812.9627" y1="779.0679" y2="779.0679"/><rect x="466" y="783.0679" width="56" height="18" rx="3" fill="#24292E" opacity="0.7"/><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="3.64" x="522" y="798.9659"> </text><rect x="525.64" y="783.0679" width="66" height="18" rx="3" fill="#24292E" opacity="0.7"/><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="3.64" x="591.64" y="798.9659"> </text><rect x="595.28" y="783.0679" width="60" height="18" rx="3" fill="#24292E" opacity="0.7"/><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="3.64" x="655.28" y="798.9659"> </text><rect x="658.92" y="783.0679" width="54" height="18" rx="3" fill="#24292E" opacity="0.7"/><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="3.64" x="712.92" y="798.9659"> </text><rect x="716.5599" y="783.0679" width="52" height="18" rx="3" fill="#24292E" opacity="0.7"/><line style="stroke:#24292E;stroke-width:1;" x1="461" x2="812.9627" y1="807.0679" y2="807.0679"/><g data-visibility-modifier="PACKAGE_PRIVATE_FIELD"><polygon fill="none" points="471,818.1019,467,824.1019,475,824.1019" style="stroke:#E0E0E0;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v0)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="114.9676" x="480" y="826.0339">compare_as : Any</text><g data-visibility-modifier="PACKAGE_PRIVATE_FIELD"><polygon fill="none" points="471,837.1698,467,843.1698,475,843.1698" style="stroke:#E0E0E0;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v0)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="70.8957" x="480" y="845.1018">value : Any</text><line style="stroke:#24292E;stroke-width:1;" x1="461" x2="812.9627" y1="853.2038" y2="853.2038"/><g data-visibility-modifier="PACKAGE_PRIVATE_METHOD"><polygon fill="#E0E0E0" points="471,864.2377,467,870.2377,475,870.2377" style="stroke:#E0E0E0;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v0)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="157.9474" x="480" y="872.1697">__eq__(other: Any) : bool</text></g><g class="entity" data-qualified-name="pydantic._internal.module:_generate_schema" data-source-line="124" id="ent0008" style="fill: var(--fgColor-accent, var(--color-accent-fg, #0969da)); cursor: pointer"><rect fill="#F8F8F8" height="45.412" rx="2.5" ry="2.5" style="stroke:#24292E;stroke-width:1;" width="180.0914" x="718" y="171.5"/><rect fill="#24292E" height="45.412" rx="2.5" ry="2.5" style="stroke:#24292E;stroke-width:1;" width="180.0914" x="718" y="171.5"/><rect fill="#24292E" height="2.5" style="stroke:#24292E;stroke-width:1;" width="180.0914" x="718" y="214.412"/><rect fill="none" height="45.412" rx="2.5" ry="2.5" style="stroke:#24292E;stroke-width:1;" width="180.0914" x="718" y="171.5"/><ellipse cx="733" cy="194.206" fill="#C0C0C0" rx="11" ry="11" style="stroke:#181818;stroke-width:1;"/><path d="M728.7188,187.8154 L731.6406,187.8154 L733.1094,193.2529 L734.5781,187.8154 L737.5156,187.8154 L737.5156,200.206 L735.4063,200.206 L735.4063,190.2841 L734.0938,195.706 L732.1563,195.706 L730.8281,190.2841 L730.8281,200.206 L728.7188,200.206 L728.7188,187.8154 Z " fill="#000000"/><text fill="#C0C0C0" font-family="Consolas,Menlo,Liberation Mono" font-size="12" font-style="italic" lengthAdjust="spacing" textLength="58.6204" x="791.7355" y="189.3281">«synthetic»</text><text fill="#FFDEAD" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="122.9895" x="747" y="207.81">_generate_schema</text><text fill="#FFDEAD" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="21.4619" x="873.6295" y="207.81">(...)</text></g><g class="entity" data-qualified-name="pydantic._internal._generate_schema.GenerateSchema" data-source-line="126" id="ent0009" style="fill: var(--fgColor-accent, var(--color-accent-fg, #0969da)); cursor: pointer"><rect fill="#F8F8F8" height="171.3396" rx="2.5" ry="2.5" style="stroke:#24292E;stroke-width:1;" width="518.14" x="182" y="108.5"/><rect fill="#24292E" height="32" rx="2.5" ry="2.5" style="stroke:#24292E;stroke-width:1;" width="518.14" x="182" y="108.5"/><rect fill="#24292E" height="2.5" style="stroke:#24292E;stroke-width:1;" width="518.14" x="182" y="138"/><rect fill="none" height="171.3396" rx="2.5" ry="2.5" style="stroke:#24292E;stroke-width:1;" width="518.14" x="182" y="108.5"/><ellipse cx="351.4553" cy="124.5" fill="#ADD1B2" rx="11" ry="11" style="stroke:#181818;stroke-width:1;"/><path d="M354.4241,130.1406 Q353.846,130.4375 353.2053,130.5781 Q352.5647,130.7344 351.8616,130.7344 Q349.3616,130.7344 348.0335,129.0938 Q346.721,127.4375 346.721,124.3125 Q346.721,121.1875 348.0335,119.5313 Q349.3616,117.875 351.8616,117.875 Q352.5647,117.875 353.2053,118.0313 Q353.8616,118.1875 354.4241,118.4844 L354.4241,121.2031 Q353.7991,120.625 353.2053,120.3594 Q352.6116,120.0781 351.9866,120.0781 Q350.6428,120.0781 349.9553,121.1563 Q349.2678,122.2188 349.2678,124.3125 Q349.2678,126.4063 349.9553,127.4844 Q350.6428,128.5469 351.9866,128.5469 Q352.6116,128.5469 353.2053,128.2813 Q353.7991,128 354.4241,127.4219 L354.4241,130.1406 Z " fill="#000000"/><text fill="#FFDEAD" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="121.3655" x="371.9553" y="129.932">GenerateSchema [</text><text fill="#B3E3F5" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="16.0159" x="496.9608" y="129.932">+3</text><text fill="#FFDEAD" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="4.606" x="512.9768" y="129.932">]</text><text fill="#FFDEAD" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="21.4619" x="521.2227" y="129.932">(...)</text><line style="stroke:#24292E;stroke-width:1;" x1="183" x2="699.14" y1="140.5" y2="140.5"/><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="479.1201" x="188" y="159.4659">Generate core schema for a Pydantic model, dataclass and types like</text><text fill="#000000" filter="url(#b1ogjyv1ulfx4v2)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="19.3899" x="670.7601" y="159.4659">str</text><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="3.99" x="690.15" y="159.4659">,</text><text fill="#000000" filter="url(#b1ogjyv1ulfx4v2)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="64.0358" x="188" y="178.5339">datetime</text><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="27.2299" x="252.0358" y="178.5339">, ... .</text><line style="stroke:#24292E;stroke-width:1;" x1="183" x2="699.14" y1="186.6358" y2="186.6358"/><rect x="188" y="190.6358" width="78" height="18" rx="3" fill="#24292E" opacity="0.7"/><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="3.64" x="266" y="206.5339"> </text><rect x="269.64" y="190.6358" width="70" height="18" rx="3" fill="#24292E" opacity="0.7"/><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="3.64" x="339.64" y="206.5339"> </text><rect x="343.28" y="190.6358" width="54" height="18" rx="3" fill="#24292E" opacity="0.7"/><text fill="#000000" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="3.64" x="397.28" y="206.5339"> </text><rect x="400.92" y="190.6358" width="58" height="18" rx="3" fill="#24292E" opacity="0.7"/><line style="stroke:#24292E;stroke-width:1;" x1="183" x2="699.14" y1="214.6358" y2="214.6358"/><g data-visibility-modifier="PROTECTED_METHOD"><polygon fill="#FFFF44" points="193,224.6698,197,228.6698,193,232.6698,189,228.6698" style="stroke:#B38D22;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v3)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="394.7145" x="202" y="233.6018">_generate_td_field_schema(...) : core_schema.TypedDictField</text><g data-visibility-modifier="PROTECTED_METHOD"><polygon fill="#FFFF44" points="193,243.7377,197,247.7377,193,251.7377,189,247.7377" style="stroke:#B38D22;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v3)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="393.3145" x="202" y="252.6697">_generate_dc_field_schema(...) : core_schema.DataclassField</text><g data-visibility-modifier="PROTECTED_METHOD"><polygon fill="#FFFF44" points="193,262.8056,197,266.8056,193,270.8056,189,266.8056" style="stroke:#B38D22;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v3)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="378.3905" x="202" y="271.7376">_generate_md_field_schema(...) : core_schema.ModelField</text></g><g class="entity" data-qualified-name="pydantic-core.python.pydantic_core.module:core_schema" data-source-line="139" id="ent0011" style="fill: var(--fgColor-accent, var(--color-accent-fg, #0969da)); cursor: pointer"><rect fill="#F8F8F8" height="167.8195" rx="2.5" ry="2.5" style="stroke:#24292E;stroke-width:1;" width="255.6131" x="930" y="110"/><rect fill="#24292E" height="45.412" rx="2.5" ry="2.5" style="stroke:#24292E;stroke-width:1;" width="255.6131" x="930" y="110"/><rect fill="#24292E" height="2.5" style="stroke:#24292E;stroke-width:1;" width="255.6131" x="930" y="152.912"/><rect fill="none" height="167.8195" rx="2.5" ry="2.5" style="stroke:#24292E;stroke-width:1;" width="255.6131" x="930" y="110"/><ellipse cx="973.7306" cy="132.706" fill="#C0C0C0" rx="11" ry="11" style="stroke:#181818;stroke-width:1;"/><path d="M969.4493,126.3154 L972.3712,126.3154 L973.8399,131.7529 L975.3087,126.3154 L978.2462,126.3154 L978.2462,138.706 L976.1368,138.706 L976.1368,128.7841 L974.8243,134.206 L972.8868,134.206 L971.5587,128.7841 L971.5587,138.706 L969.4493,138.706 L969.4493,126.3154 Z " fill="#000000"/><text fill="#C0C0C0" font-family="Consolas,Menlo,Liberation Mono" font-size="12" font-style="italic" lengthAdjust="spacing" textLength="58.6204" x="1044.6886" y="127.8281">«synthetic»</text><text fill="#FFDEAD" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="94.2476" x="994.1151" y="146.31">core_schema [</text><text fill="#BEF5CB" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="16.0159" x="1092.0027" y="146.31">+3</text><text fill="#FFDEAD" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="3.64" x="1108.0187" y="146.31"> </text><text fill="#FDAEB7" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="12.5159" x="1111.6587" y="146.31">-3</text><text fill="#FFDEAD" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="4.606" x="1124.1746" y="146.31">]</text><text fill="#FFDEAD" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="21.4619" x="1132.4206" y="146.31">(...)</text><line style="stroke:#24292E;stroke-width:1;" x1="931" x2="1184.6131" y1="155.412" y2="155.412"/><g data-visibility-modifier="PACKAGE_PRIVATE_METHOD"><polygon fill="#E0E0E0" points="941,166.446,937,172.446,945,172.446" style="stroke:#E0E0E0;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v0)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="229.6131" x="950" y="174.378">typed_dict_field(...) : TypedDictField</text><g data-visibility-modifier="PACKAGE_PRIVATE_METHOD"><polygon fill="#E0E0E0" points="941,185.5139,937,191.5139,945,191.5139" style="stroke:#E0E0E0;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v0)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="179.4093" x="950" y="193.4459">model_field(...) : ModelField</text><g data-visibility-modifier="PACKAGE_PRIVATE_METHOD"><polygon fill="#E0E0E0" points="941,204.5818,937,210.5818,945,210.5818" style="stroke:#E0E0E0;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v0)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="219.9952" x="950" y="212.5138">dataclass_field(...) : DataclassField</text><g data-visibility-modifier="PACKAGE_PRIVATE_METHOD"><polygon fill="#E0E0E0" points="941,223.6497,937,229.6497,945,229.6497" style="stroke:#E0E0E0;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v1)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="219.9952" x="950" y="231.5817">dataclass_field(...) : DataclassField</text><g data-visibility-modifier="PACKAGE_PRIVATE_METHOD"><polygon fill="#E0E0E0" points="941,242.7177,937,248.7177,945,248.7177" style="stroke:#E0E0E0;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v1)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="179.4093" x="950" y="250.6496">model_field(...) : ModelField</text><g data-visibility-modifier="PACKAGE_PRIVATE_METHOD"><polygon fill="#E0E0E0" points="941,261.7856,937,267.7856,945,267.7856" style="stroke:#E0E0E0;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v1)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="229.6131" x="950" y="269.7176">typed_dict_field(...) : TypedDictField</text></g><g class="entity" data-qualified-name="tests.module:test_main" data-source-line="149" id="ent0013" style="fill: var(--fgColor-accent, var(--color-accent-fg, #0969da)); cursor: pointer"><rect fill="#F8F8F8" height="129.6837" rx="2.5" ry="2.5" style="stroke:#24292E;stroke-width:1;" width="337.8768" x="1210" y="129"/><rect fill="#24292E" height="45.412" rx="2.5" ry="2.5" style="stroke:#24292E;stroke-width:1;" width="337.8768" x="1210" y="129"/><rect fill="#24292E" height="2.5" style="stroke:#24292E;stroke-width:1;" width="337.8768" x="1210" y="171.912"/><rect fill="none" height="129.6837" rx="2.5" ry="2.5" style="stroke:#24292E;stroke-width:1;" width="337.8768" x="1210" y="129"/><ellipse cx="1313.8166" cy="151.706" fill="#C0C0C0" rx="11" ry="11" style="stroke:#181818;stroke-width:1;"/><path d="M1309.5354,145.3154 L1312.4572,145.3154 L1313.926,150.7529 L1315.3947,145.3154 L1318.3322,145.3154 L1318.3322,157.706 L1316.2229,157.706 L1316.2229,147.7841 L1314.9104,153.206 L1312.9729,153.206 L1311.6447,147.7841 L1311.6447,157.706 L1309.5354,157.706 L1309.5354,145.3154 Z " fill="#000000"/><text fill="#C0C0C0" font-family="Consolas,Menlo,Liberation Mono" font-size="12" font-style="italic" lengthAdjust="spacing" textLength="58.6204" x="1365.8782" y="146.8281">«synthetic»</text><text fill="#FFDEAD" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="72.3797" x="1334.3166" y="165.31">test_main [</text><text fill="#BEF5CB" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="16.0159" x="1410.3363" y="165.31">+4</text><text fill="#FFDEAD" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="4.606" x="1426.3522" y="165.31">]</text><text fill="#FFDEAD" font-family="Consolas,Menlo,Liberation Mono" font-size="14" font-weight="bold" lengthAdjust="spacing" textLength="21.4619" x="1434.5982" y="165.31">(...)</text><line style="stroke:#24292E;stroke-width:1;" x1="1211" x2="1546.8768" y1="174.412" y2="174.412"/><g data-visibility-modifier="PACKAGE_PRIVATE_METHOD"><polygon fill="#E0E0E0" points="1221,185.446,1217,191.446,1225,191.446" style="stroke:#E0E0E0;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v0)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="311.8768" x="1230" y="193.378">test_exclude_default_binary_compare_as() : Any</text><g data-visibility-modifier="PACKAGE_PRIVATE_METHOD"><polygon fill="#E0E0E0" points="1221,204.5139,1217,210.5139,1225,210.5139" style="stroke:#E0E0E0;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v0)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="221.3111" x="1230" y="212.4459">test_eq_unary_compare_as() : Any</text><g data-visibility-modifier="PACKAGE_PRIVATE_METHOD"><polygon fill="#E0E0E0" points="1221,223.5818,1217,229.5818,1225,229.5818" style="stroke:#E0E0E0;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v0)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="308.3068" x="1230" y="231.5138">test_exclude_default_unary_compare_as() : Any</text><g data-visibility-modifier="PACKAGE_PRIVATE_METHOD"><polygon fill="#E0E0E0" points="1221,242.6497,1217,248.6497,1225,248.6497" style="stroke:#E0E0E0;stroke-width:1;"/></g><text fill="#000000" filter="url(#b1ogjyv1ulfx4v0)" font-family="Consolas,Menlo,Liberation Mono" font-size="14" lengthAdjust="spacing" textLength="224.8811" x="1230" y="250.5817">test_eq_binary_compare_as() : Any</text></g><g class="link" data-entity-1="ent0003" data-entity-2="ent0004" data-link-type="dependency" id="lnk14"><polygon fill="#464646" points="205.0678,389.7462,201.124,380.7214,201.3774,386.3726,195.7262,386.626,205.0678,389.7462" style="stroke:#464646;stroke-width:1;"/><path d="M163.5066,346.1458 C165.6232,348.8311 167.7876,351.4529 170,354 C180.7778,366.4083 188.1629,374.2925 200.6393,385.6979" fill="none" style="stroke:#464646;stroke-width:1;"/></g><g class="link" data-entity-1="ent0004" data-entity-2="ent0006" data-link-type="dependency" id="lnk15"><polygon fill="#00CC00" points="577.5529,719.8383,575.347,710.2397,574.5505,715.8402,568.95,715.0436,577.5529,719.8383" style="stroke:#00CC00;stroke-width:1;"/><path d="M550.7463,684.1418 C559.9312,696.3726 565.3734,703.6197 573.95,715.0405" fill="none" style="stroke:#00CC00;stroke-width:1;"/></g><g class="link" data-entity-1="ent0004" data-entity-2="ent0005" data-link-type="aggregation" id="lnk16"><polygon fill="none" points="436.1878,952.8612,440.0174,946.7511,435.8501,940.866,432.0205,946.9762,436.1878,952.8612" style="stroke:#464646;stroke-width:1;"/><path d="M434.7333,684.1229 C433.7659,773.719 433.9131,872.0652 435.8501,940.866" fill="none" style="stroke:#464646;stroke-width:1;"/></g><g class="link" data-entity-1="ent0008" data-entity-2="ent0004" data-link-type="dependency" id="lnk17"><polygon fill="#464646" points="670.8248,389.9237,680.2564,387.0873,674.6154,386.6632,675.0396,381.0223,670.8248,389.9237" style="stroke:#464646;stroke-width:1;"/><path d="M798.1178,216.7484 C782.5668,249.3103 749.8974,311.4475 709,354 C697.1132,366.3678 688.8035,374.4594 675.3736,386.0111" fill="none" style="stroke:#464646;stroke-width:1;"/></g><g class="link" data-entity-1="ent0005" data-entity-2="ent0004" data-link-type="aggregation" id="lnk18"><polygon fill="none" points="445.8122,952.8612,449.9795,946.9762,446.1499,940.866,441.9826,946.7511,445.8122,952.8612" style="stroke:#464646;stroke-width:1;"/><path d="M446.1499,940.866 C448.0869,872.0652 448.2341,773.719 447.2667,684.1229" fill="none" style="stroke:#464646;stroke-width:1;"/></g><g class="link" data-entity-1="ent0009" data-entity-2="ent0004" data-link-type="dependency" id="lnk19"><polygon fill="#464646" points="441,389.9429,445,380.9429,441,384.9429,437,380.9429,441,389.9429" style="stroke:#464646;stroke-width:1;"/><path d="M441,279.7303 C441,313.0654 441,346.3151 441,383.9429" fill="none" style="stroke:#464646;stroke-width:1;"/></g></g></svg>`;

function Loader(){
  return(<div style={{position:"absolute",inset:0,background:"#fff",display:"flex",alignItems:"center",justifyContent:"center",zIndex:10}}>
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
      <div style={{width:22,height:22,border:"2px solid #d0d7de",borderTopColor:"#0969da",borderRadius:"50%",animation:"spin .65s linear infinite"}}/>
      <span style={{fontSize:12,color:"#656d76",fontFamily:ff}}>Generating striff diagram…</span>
    </div>
  </div>);
}

function DB({d,id,focusRange}){
  const bg=t=>t===1?"#dafbe1":t===-1?"#ffebe9":"transparent";
  const gb=t=>t===1?"#ccffd8":t===-1?"#ffd7d5":"transparent";
  const addC=d.lines.filter(l=>l.t===1).length;
  const delC=d.lines.filter(l=>l.t===-1).length;
  return(<div id={id} style={{marginBottom:0}}>
    {/* File header */}
    <div style={{
      padding:"8px 12px",background:"#f6f8fa",borderBottom:"1px solid #d0d7de",borderTop:"1px solid #d0d7de",
      fontSize:12,fontFamily:mono,color:"#1f2328",fontWeight:600,display:"flex",alignItems:"center",gap:8,
      position:"sticky",top:0,zIndex:5
    }}>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="#57606a" style={{flexShrink:0}}>
        <path d="M8 4a.5.5 0 01.5.5v3h3a.5.5 0 010 1h-3v3a.5.5 0 01-1 0v-3h-3a.5.5 0 010-1h3v-3A.5.5 0 018 4z"/>
        <path d="M4.715 6.542L3.343 7.914a7 7 0 104.95 4.95l1.372-1.372a.25.25 0 00-.177-.427H7.5a.5.5 0 01-.5-.5V8.707a.25.25 0 00-.427-.177z" opacity=".3"/>
      </svg>
      <span style={{color:"#1f2328"}}>{d.path}</span>
      <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:4,fontWeight:400,fontSize:12}}>
        {addC>0&&<span style={{color:"#1a7f37"}}>+{addC}</span>}
        {delC>0&&<span style={{color:"#cf222e"}}>-{delC}</span>}
      </div>
    </div>
    {/* Hunk header */}
    <div style={{background:"#ddf4ff",color:"#57606a",padding:"0 12px",fontSize:12,fontFamily:mono,borderBottom:"1px solid #d0d7de",lineHeight:"32px",display:"flex",alignItems:"center"}}>
      <span style={{width:50,display:"inline-block",textAlign:"center",color:"#bcc4cc",userSelect:"none",flexShrink:0}}>…</span>
      <span style={{width:50,display:"inline-block",textAlign:"center",color:"#bcc4cc",userSelect:"none",flexShrink:0}}>…</span>
      <span style={{paddingLeft:12,color:"#0550ae"}}>@@ changes @@</span>
    </div>
    {/* Lines */}
    {d.lines.map((l,i)=>{
      const inFocus=focusRange&&i>=focusRange.start&&i<=focusRange.end;
      return(<div id={inFocus&&i===focusRange.start?`${id}-focus`:undefined} key={i} style={{
        display:"flex",
        background:inFocus?"linear-gradient(90deg, rgba(9,105,218,.08), rgba(9,105,218,.03) 72%, transparent)":bg(l.t),
        fontFamily:mono,
        fontSize:12,
        lineHeight:"20px",
        color:"#1f2328",
        borderBottom:i===d.lines.length-1?"1px solid #d0d7de":"none",
        boxShadow:inFocus?"inset 2px 0 0 #0969da":"none",
        position:"relative",
        zIndex:inFocus?1:0,
      }}>
      <span style={{width:50,textAlign:"right",padding:"0 8px",color:l.t===0?"#636c76":l.t===1?"#116329":"#cf222e",background:gb(l.t),userSelect:"none",flexShrink:0,borderRight:"1px solid "+( l.t===1?"#aceebb":l.t===-1?"#ffcecb":"#eaeef2"),fontSize:12,lineHeight:"20px"}}>{l.o??""}</span>
      <span style={{width:50,textAlign:"right",padding:"0 8px",color:l.t===0?"#636c76":l.t===1?"#116329":"#cf222e",background:gb(l.t),userSelect:"none",flexShrink:0,borderRight:"1px solid "+(l.t===1?"#aceebb":l.t===-1?"#ffcecb":"#eaeef2"),fontSize:12,lineHeight:"20px"}}>{l.n??""}</span>
      <span style={{width:20,textAlign:"center",color:l.t===1?"#116329":l.t===-1?"#cf222e":"transparent",userSelect:"none",flexShrink:0,fontWeight:400,lineHeight:"20px"}}>{l.t===1?"+":l.t===-1?"-":" "}</span>
      <code style={{whiteSpace:"pre",flex:1,paddingRight:12,fontFamily:mono,fontSize:12,lineHeight:"20px",tabSize:4}}>{l.c}</code>
    </div>);
    })}
  </div>);
}

function FileItem({name,active,onClick,dataN}){
  return(<div data-file={dataN} onClick={onClick} style={{
    padding:"4px 8px 4px 32px",cursor:"pointer",display:"flex",alignItems:"center",gap:6,
    fontSize:12,fontFamily:ff,color:active?"#1f2328":"#636c76",
    background:active?"#ddf4ff":"transparent",
    borderLeft:active?"2px solid #0969da":"2px solid transparent",
    transition:"background .12s, border-color .12s",
    lineHeight:"20px",
  }}>
    <svg width="16" height="16" viewBox="0 0 16 16" fill="#7d8590" style={{flexShrink:0}}><path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0113.25 16h-9.5A1.75 1.75 0 012 14.25zm1.75-.25a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 00.25-.25V6h-2.75A1.75 1.75 0 019 4.25V1.5zm6.75.062V4.25c0 .138.112.25.25.25h2.688z"/></svg>
    <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</span>
  </div>);
}

/* Counter badge like GitHub's */
function Badge({n,style:s}){
  return <span style={{fontSize:12,padding:"0 6px",borderRadius:10,background:"rgba(175,184,193,.2)",color:"#636c76",fontWeight:600,lineHeight:"18px",display:"inline-block",minWidth:20,textAlign:"center",...s}}>{n}</span>;
}

export default function Demo(){
  const [view,setView]=useState("diffs");
  const [ents,setEnts]=useState([]);
  const [loading,setLoading]=useState(false);
  const [activeFile,setActiveFile]=useState(null);
  const [activeEntity,setActiveEntity]=useState(null);
  const [demoKey,setDemoKey]=useState(0);
  const [demoRunning,setDemoRunning]=useState(false);
  const [cursor,setCursor]=useState({x:-40,y:-40,vis:false,click:false,grab:false});
  const [svgTransform,setSvgTransform]=useState({ scale: 1, x: 0, y: 0 });
  const svgR=useRef(null),diffR=useRef(null),rootR=useRef(null),stageR=useRef(null);
  const dragRef=useRef(null);
  const dragMovedRef=useRef(false);
  const demoCancelRef=useRef(false);
  const MIN_SCALE = 0.45;
  const MAX_SCALE = 2.0;

  const scrollDiffTarget=useCallback((fileName,focus)=>{
    const panel=document.getElementById(`d-${fileName}`);
    if(!panel||!diffR.current)return;
    const target=focus?document.getElementById(`d-${fileName}-focus`):null;
    const top=(target?.offsetTop??panel.offsetTop)-18;
    diffR.current.scrollTo({top:Math.max(0,top),behavior:"smooth"});
  },[]);

  const fitAll=useCallback(()=>{
    const stage=stageR.current;
    if(!stage)return;
    const rect={ width: stage.clientWidth||720, height: stage.clientHeight||408 };
    const base=createViewportForBounds(
      rect,
      SVG_CONTENT_BOUNDS,
      { paddingX: 26, paddingY: 22, minScale: MIN_SCALE, maxScale: 1.1 }
    );
    // No extra zoom-in: this is the "zoomed out" overview frame.
    setSvgTransform(base);
  },[MIN_SCALE]);

  const cancelDemo=useCallback(()=>{
    demoCancelRef.current=true;
    setDemoRunning(false);
    setCursor(c=>({...c,vis:false,click:false,grab:false}));
  },[]);

  const replayDemo=useCallback(()=>{
    demoCancelRef.current=true;
    // next tick: allow effect to re-run
    setTimeout(()=>{ demoCancelRef.current=false; },0);
    setDemoRunning(true);
    setDemoKey(k=>k+1);
  },[]);

  const posInRoot=useCallback((el: Element | null, bias = {x:0.35,y:0.35})=>{
    if(!el || !rootR.current) return null;
    const r=(el as HTMLElement).getBoundingClientRect();
    const p=(rootR.current as HTMLElement).getBoundingClientRect();
    return {
      x: (r.left - p.left) + r.width * bias.x,
      y: (r.top - p.top) + r.height * bias.y,
    };
  },[]);

  const svgPointToRoot=useCallback((svgPoint:{x:number;y:number})=>{
    if(!rootR.current || !stageR.current) return null;
    const stageRect=(stageR.current as HTMLElement).getBoundingClientRect();
    const rootRect=(rootR.current as HTMLElement).getBoundingClientRect();
    const ox=stageRect.left-rootRect.left;
    const oy=stageRect.top-rootRect.top;
    return {
      x: ox + svgTransform.x + svgPoint.x * svgTransform.scale,
      y: oy + svgTransform.y + svgPoint.y * svgTransform.scale,
    };
  },[svgTransform.x,svgTransform.y,svgTransform.scale]);

  const getEntityCenter=useCallback((qualifiedName:string)=>{
    const svg=svgR.current?.querySelector("svg");
    if(!svg) return null;
    const el=svg.querySelector(`[data-qualified-name="${qualifiedName}"]`);
    const bbox=el?.getBBox?.();
    if(!bbox) return null;
    return { x: bbox.x + bbox.width/2, y: bbox.y + bbox.height/2 };
  },[]);

  const focusEntities=useCallback((entityNames)=>{
    const stage=stageR.current;
    const svg=svgR.current?.querySelector("svg");
    if(!stage||!svg||!entityNames?.length)return false;
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    entityNames.forEach(name=>{
      const el=svg.querySelector(`[data-qualified-name="${name}"]`);
      const bbox=el?.getBBox?.();
      if(!bbox)return;
      minX=Math.min(minX,bbox.x);
      minY=Math.min(minY,bbox.y);
      maxX=Math.max(maxX,bbox.x+bbox.width);
      maxY=Math.max(maxY,bbox.y+bbox.height);
    });
    if(minX===Infinity)return false;
    const rect={ width: stage.clientWidth||720, height: stage.clientHeight||408 };
    const isSingle = entityNames.length === 1;
    const base=createViewportForBounds(
      rect,
      { x: minX, y: minY, width: maxX-minX, height: maxY-minY },
      {
        paddingX: isSingle ? 110 : 140,
        paddingY: isSingle ? 78 : 96,
        minScale: MIN_SCALE,
        maxScale: MAX_SCALE,
        offsetY: -6
      }
    );
    setSvgTransform(
      zoomTransformAroundPoint(
        base,
        { x: rect.width/2, y: rect.height/2 },
        1.03,
        { minScale: MIN_SCALE, maxScale: MAX_SCALE }
      )
    );
    return true;
  },[MIN_SCALE,MAX_SCALE]);

  useEffect(()=>{
    const svg=svgR.current?.querySelector("svg");
    if(!svg)return;
    svg.style.display="block";
    // Fill the wrapper box (wrapper has a fixed intrinsic size).
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    // Crop out large empty margins so the diagram fills the stage.
    svg.setAttribute(
      "viewBox",
      `${SVG_CONTENT_BOUNDS.x} ${SVG_CONTENT_BOUNDS.y} ${SVG_CONTENT_BOUNDS.width} ${SVG_CONTENT_BOUNDS.height}`,
    );
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  },[]);

  useEffect(()=>{
    if(view!=="striffs")return;
    if(ents.length){
      if(!focusEntities(ents)) fitAll();
      return;
    }
    fitAll();
  },[view,ents,fitAll,focusEntities]);

  useEffect(()=>{
    const c=svgR.current;if(!c)return;const on=ents.length>0;
    c.querySelectorAll(".entity").forEach(el=>{
      const m=ents.includes(el.getAttribute("data-qualified-name"));
      // Avoid blur: it creates ugly halos/blocks around small text and badges.
      el.style.cssText=`transition:opacity .4s,filter .4s;opacity:${on?(m?"1":"0.18"):"1"};filter:${m?"drop-shadow(0 0 14px rgba(9,105,218,.28)) saturate(1.06)":"saturate(.78)"};cursor:pointer`;
    });
    c.querySelectorAll(".link").forEach(el=>{
      el.style.cssText=`transition:opacity .4s,filter .4s`;
      if(!on){el.style.opacity="1";return;}
      const a=c.querySelector(`#${el.getAttribute("data-entity-1")}`)?.getAttribute("data-qualified-name")||"";
      const b=c.querySelector(`#${el.getAttribute("data-entity-2")}`)?.getAttribute("data-qualified-name")||"";
      const active=ents.includes(a)||ents.includes(b);
      el.style.opacity=active?"1":"0.08";
      el.style.filter=active?"drop-shadow(0 0 10px rgba(9,105,218,.18))":"none";
    });
    c.querySelectorAll(".cluster").forEach(el=>{el.style.cssText=`transition:opacity .4s,filter .4s;opacity:${on?"0.24":"1"};filter:none`});
  },[ents]);

  const pointerDown=useCallback(e=>{
    if(view!=="striffs")return;
    cancelDemo();
    dragMovedRef.current=false;
    dragRef.current={x:e.clientX,y:e.clientY,originX:svgTransform.x,originY:svgTransform.y};
    e.currentTarget.setPointerCapture?.(e.pointerId);
  },[cancelDemo,svgTransform.x,svgTransform.y,view]);

  const pointerMove=useCallback(e=>{
    if(!dragRef.current||view!=="striffs")return;
    const dx=e.clientX-dragRef.current.x;
    const dy=e.clientY-dragRef.current.y;
    if(Math.abs(dx)>4||Math.abs(dy)>4)dragMovedRef.current=true;
    setSvgTransform(t=>({...t,x:dragRef.current.originX+dx,y:dragRef.current.originY+dy}));
  },[view]);

  const pointerUp=useCallback(e=>{
    if(!dragRef.current)return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    dragRef.current=null;
  },[]);

  const wheelZoom=useCallback(e=>{
    if(view!=="striffs")return;
    const stage=stageR.current;
    if(!stage)return;
    const rect=stage.getBoundingClientRect();
    const px=e.clientX-rect.left;
    const py=e.clientY-rect.top;
    const minScale=MIN_SCALE;
    const maxScale=MAX_SCALE;
    const zoom=e.deltaY<0?1.12:0.89;
    const safeScale=svgTransform.scale||1;
    const nextScale=clamp(safeScale*zoom,minScale,maxScale);
    // At the zoom limit in this direction: don't swallow the event, let the page scroll.
    if(nextScale===safeScale)return;
    cancelDemo();
    e.preventDefault();
    const contentX=(px-svgTransform.x)/safeScale;
    const contentY=(py-svgTransform.y)/safeScale;
    setSvgTransform({
      scale:nextScale,
      x:px-contentX*nextScale,
      y:py-contentY*nextScale,
    });
  },[cancelDemo,svgTransform,view,MIN_SCALE,MAX_SCALE]);

  // React attaches onWheel passively at the root, so preventDefault there can't
  // stop the page from scrolling; bind a non-passive native listener instead.
  const wheelZoomRef=useRef(wheelZoom);
  useEffect(()=>{wheelZoomRef.current=wheelZoom;},[wheelZoom]);
  useEffect(()=>{
    const stage=stageR.current as HTMLElement|null;
    if(!stage)return;
    const onWheel=(e:WheelEvent)=>wheelZoomRef.current(e);
    stage.addEventListener("wheel",onWheel,{passive:false});
    return()=>stage.removeEventListener("wheel",onWheel);
  },[]);

  const svgClick=useCallback(e=>{
    if(dragMovedRef.current){dragMovedRef.current=false;return;}
    cancelDemo();
    let t=e.target;while(t&&t!==svgR.current){
      if(t.classList?.contains("entity")){
        const name=t.getAttribute("data-qualified-name");
        const focus=entityFocus[name];
        const f=ent2file[name];
        if(f){
          setActiveEntity(name);
          setView("diffs");
          setEnts([]);
          setActiveFile(f);
          setTimeout(()=>scrollDiffTarget(f,focus),280);
        }return;
      }t=t.parentElement;
    }
  },[cancelDemo,scrollDiffTarget]);

  const clickFile=f=>{
    cancelDemo();
    setActiveFile(f.name);setActiveEntity(null);
    if(view==="striffs"){
      setEnts(f.ents);
      // Wait a tick for layout; then reframe to this file's touched entities.
      setTimeout(()=>focusEntities(f.ents),0);
    }
    else{scrollDiffTarget(f.name,null);}
  };

  const toggle=()=>{
    cancelDemo();
    if(view==="diffs"){
      setLoading(true);
      setTimeout(()=>{
        setLoading(false);
        setView("striffs");
      },800);
    }else{
      setView("diffs");
      setEnts([]);
    }
  };

  // Guided demo (runs once per demoKey). Cancels on any user interaction via cancelDemo().
  useEffect(()=>{
    if(!demoRunning) return;
    demoCancelRef.current=false;
    let mounted=true;
    const wait=(ms:number)=>new Promise<void>(resolve=>{
      const id=window.setTimeout(resolve,ms);
      return ()=>window.clearTimeout(id);
    });

    const moveCursor=async (x:number,y:number,ms=520)=>{
      if(!mounted || demoCancelRef.current) return false;
      setCursor(c=>({...c,vis:true,click:false,grab:false,x,y}));
      await wait(ms);
      return mounted && !demoCancelRef.current;
    };
    const clickCursor=async ()=>{
      if(!mounted || demoCancelRef.current) return false;
      setCursor(c=>({...c,click:true}));
      await wait(220);
      setCursor(c=>({...c,click:false}));
      await wait(120);
      return mounted && !demoCancelRef.current;
    };

    (async()=>{
      try{
        // Start on diffs.
        setView("diffs");
        setActiveEntity(null);
        setActiveFile(null);
        setEnts([]);
        diffR.current?.scrollTo({top:0,behavior:"auto"});
        await wait(260);
        if(demoCancelRef.current || !mounted) return;

        const striffsBtn=rootR.current?.querySelector('[data-btn="striffs"]') as Element | null;
        const btnPos=posInRoot(striffsBtn,{x:0.5,y:0.5});
        if(btnPos){
          await moveCursor(btnPos.x,btnPos.y,520);
          await clickCursor();
        }
        // Switch to Striffs view.
        setLoading(true);
        await wait(260);
        setLoading(false);
        setView("striffs");
        await wait(220);
        fitAll();
        await wait(720);
        if(demoCancelRef.current || !mounted) return;

        // Purposeful pan+zoom with cursor.
        const stageCenter=posInRoot(stageR.current,{x:0.56,y:0.46});
        if(stageCenter){
          await moveCursor(stageCenter.x,stageCenter.y,420);
          setCursor(c=>({...c,grab:true}));
          // Small human-like drag.
          setSvgTransform(t=>({...t,x:t.x-92,y:t.y-22}));
          await moveCursor(stageCenter.x-76,stageCenter.y-18,520);
          setCursor(c=>({...c,grab:false}));
          await wait(180);
        }
        if(demoCancelRef.current || !mounted) return;

        const zoomPoint=stageCenter ?? posInRoot(stageR.current,{x:0.6,y:0.5});
        if(zoomPoint && stageR.current){
          await moveCursor(zoomPoint.x,zoomPoint.y,320);
          const stageRect=(stageR.current as HTMLElement).getBoundingClientRect();
          const rootRect=(rootR.current as HTMLElement).getBoundingClientRect();
          const px=zoomPoint.x - (stageRect.left-rootRect.left);
          const py=zoomPoint.y - (stageRect.top-rootRect.top);
          setSvgTransform(t=>{
            const safe=t.scale||1;
            const next=clamp(safe*1.18,MIN_SCALE,MAX_SCALE);
            const cx=(px-t.x)/safe;
            const cy=(py-t.y)/safe;
            return { scale: next, x: px-cx*next, y: py-cy*next };
          });
          await wait(720);
        }
        if(demoCancelRef.current || !mounted) return;

        // Click fields.py to focus.
        const fieldsEl=rootR.current?.querySelector('[data-file="fields.py"]') as Element | null;
        const fieldsPos=posInRoot(fieldsEl,{x:0.55,y:0.55});
        if(fieldsPos){
          await moveCursor(fieldsPos.x,fieldsPos.y,620);
          await clickCursor();
        }
        setActiveFile("fields.py");
        const fieldsEnts=tree[0]?.files?.[0]?.ents ?? [];
        setEnts(fieldsEnts);
        await wait(60);
        focusEntities(fieldsEnts);
        await wait(920);
        if(demoCancelRef.current || !mounted) return;

        // Click a component to jump back to diffs.
        const target="pydantic.fields.FieldInfo";
        const targetCenter=getEntityCenter(target);
        const targetPos=targetCenter ? svgPointToRoot(targetCenter) : null;
        if(targetPos){
          await moveCursor(targetPos.x,targetPos.y,620);
          await clickCursor();
        }
        setActiveEntity(target);
        setView("diffs");
        setEnts([]);
        setActiveFile("fields.py");
        await wait(420);
        scrollDiffTarget("fields.py",entityFocus[target]);
        await wait(1200);

        // End.
        setCursor(c=>({...c,vis:false,grab:false,click:false}));
        setDemoRunning(false);
      } catch {
        // ignore
      }
    })();

    return ()=>{
      mounted=false;
      demoCancelRef.current=true;
    };
  },[demoKey,demoRunning,cancelDemo,fitAll,focusEntities,getEntityCenter,posInRoot,scrollDiffTarget,svgPointToRoot,MIN_SCALE,MAX_SCALE]);

  const totalAdd=allDiffs.reduce((s,d)=>s+d.lines.filter(l=>l.t===1).length,0);
  const totalDel=allDiffs.reduce((s,d)=>s+d.lines.filter(l=>l.t===-1).length,0);

  return(
    <div style={{fontFamily:ff,fontSize:14,color:"#1f2328",maxWidth:960,margin:"0 auto"}}>

      {/* Browser chrome */}
      <div style={{borderRadius:"12px 12px 0 0",background:"linear-gradient(180deg,#eceff4 0%,#dde4ec 100%)",padding:"8px 12px 6px",display:"flex",alignItems:"center",gap:10,border:"1px solid #c8d1dc",borderBottom:"none"}}>
        <div style={{display:"flex",gap:8}}>
          <div style={{width:12,height:12,borderRadius:"50%",background:"#ff5f57",boxShadow:"inset 0 -1px 0 rgba(0,0,0,.1)"}}/>
          <div style={{width:12,height:12,borderRadius:"50%",background:"#febc2e",boxShadow:"inset 0 -1px 0 rgba(0,0,0,.1)"}}/>
          <div style={{width:12,height:12,borderRadius:"50%",background:"#28c840",boxShadow:"inset 0 -1px 0 rgba(0,0,0,.1)"}}/>
        </div>
        <div style={{flex:1,background:"#fff",borderRadius:6,padding:"5px 12px",fontSize:12,color:"#57606a",display:"flex",alignItems:"center",gap:6,border:"1px solid rgba(0,0,0,.06)",boxShadow:"inset 0 1px 2px rgba(0,0,0,.04)"}}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="#8b949e"><path d="M8 0C3.58 0 0 3.58 0 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm0 14.5a6.5 6.5 0 110-13 6.5 6.5 0 010 13z"/><path d="M8 3.5a.5.5 0 01.5.5v3.793l2.354 2.353a.5.5 0 01-.708.708l-2.5-2.5A.5.5 0 017.5 8V4a.5.5 0 01.5-.5z" opacity=".5"/></svg>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="#57606a"><path fillRule="evenodd" d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 010-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5zm10.5-1h-8a1 1 0 00-1 1v6.708A2.486 2.486 0 014.5 9h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z"/></svg>
          <span style={{color:"#1f2328",fontWeight:500}}>github.com</span>
          <span style={{color:"#8b949e"}}>/pydantic/pydantic/pull/9237/files</span>
        </div>
      </div>

      {/* GitHub header bar */}
      <div style={{background:"#24292e",padding:"0 16px",display:"flex",alignItems:"center",height:46,gap:16}}>
        {/* Octocat */}
        <svg height="28" width="28" viewBox="0 0 16 16" fill="#fff">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        <div style={{display:"flex",alignItems:"center",gap:4,color:"#fff",fontSize:14,fontWeight:600}}>
          <span style={{color:"#79c0ff",fontWeight:600}}>pydantic</span>
          <span style={{color:"#8b949e",fontWeight:400}}>/</span>
          <span style={{color:"#79c0ff",fontWeight:600}}>pydantic</span>
        </div>
      </div>

      {/* PR title bar */}
      <div style={{background:"#fff",padding:"16px 16px 0",borderLeft:"1px solid #d0d7de",borderRight:"1px solid #d0d7de"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
          <h1 style={{fontSize:20,fontWeight:400,lineHeight:"28px",margin:0,color:"#1f2328",flex:1}}>
            Add <code style={{fontSize:17,fontFamily:mono,background:"rgba(175,184,193,.2)",padding:"2px 6px",borderRadius:6}}>compare_as</code> support for custom field equality
            <span style={{color:"#636c76",fontWeight:300}}> #9237</span>
          </h1>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8,paddingBottom:12}}>
          <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 10px",borderRadius:16,fontSize:12,fontWeight:600,background:"#dafbe1",color:"#1a7f37",border:"1px solid transparent"}}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z"/></svg>
            Open
          </span>
          <span style={{fontSize:14,color:"#636c76"}}>
            <span style={{fontWeight:600,color:"#1f2328"}}>samuelcolvin</span> wants to merge 3 commits into <code style={{fontSize:12,fontFamily:mono,background:"#ddf4ff",color:"#0550ae",padding:"2px 6px",borderRadius:6}}>main</code> from <code style={{fontSize:12,fontFamily:mono,background:"#ddf4ff",color:"#0550ae",padding:"2px 6px",borderRadius:6}}>feature/compare-as</code>
          </span>
        </div>
      </div>

      {/* GitHub content area */}
      <div ref={rootR} style={{overflow:"hidden",border:"1px solid #d0d7de",borderTop:"none",background:"#fff",boxShadow:"0 14px 38px rgba(15,23,42,.08)",position:"relative"}}>
        <Cursor x={cursor.x} y={cursor.y} clicking={cursor.click} vis={cursor.vis} grabbing={cursor.grab} />

        {/* PR Tabs */}
        <div style={{display:"flex",padding:"0 16px",borderBottom:"1px solid #d0d7de",background:"#f6f8fa",fontSize:14,overflowX:"auto"}}>
          {[
            {l:"Conversation",c:12,d:"M1.75 1h12.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0114.25 13H9.06l-2.573 2.573A1.458 1.458 0 014 13.543V13H1.75A1.75 1.75 0 010 11.25v-8.5C0 1.784.784 1 1.75 1zm0 1.5a.25.25 0 00-.25.25v8.5c0 .138.112.25.25.25h3.5a.75.75 0 01.75.75v2.19l2.72-2.72a.749.749 0 01.53-.22h4.5a.25.25 0 00.25-.25v-8.5a.25.25 0 00-.25-.25H1.75z"},
            {l:"Commits",c:3,d:"M11.93 8.5a4.002 4.002 0 01-7.86 0H.75a.75.75 0 010-1.5h3.32a4.002 4.002 0 017.86 0h3.32a.75.75 0 010 1.5zM8 10.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"},
            {l:"Checks",c:2,d:"M8 16A8 8 0 108 0a8 8 0 000 16zm3.78-9.72a.751.751 0 01-.018 1.042L7.75 11.28a.749.749 0 01-1.06 0L4.72 9.28a.751.751 0 011.06-1.06L7.25 9.94l3.72-3.72a.749.749 0 011.06 0z"},
            {l:"Files changed",c:4,a:true,d:"M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0113.25 16h-9.5A1.75 1.75 0 012 14.25zm1.75-.25a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 00.25-.25V6h-2.75A1.75 1.75 0 019 4.25V1.5zm6.75.062V4.25c0 .138.112.25.25.25h2.688z"},
          ].map(t=>(
            <div key={t.l} style={{display:"flex",alignItems:"center",gap:6,padding:"10px 16px",color:t.a?"#1f2328":"#636c76",fontWeight:t.a?600:400,cursor:"pointer",borderBottom:t.a?"2px solid #fd8c73":"2px solid transparent",marginBottom:-1,whiteSpace:"nowrap",fontSize:14,lineHeight:"20px"}}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d={t.d}/></svg>
              {t.l}
              <Badge n={t.c}/>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{display:"flex",alignItems:"center",padding:"8px 16px",borderBottom:"1px solid #d0d7de",background:"#fff",gap:8}}>
          <button data-btn="diffs" onClick={toggle} style={{
            padding:"5px 14px",fontSize:12,fontFamily:ff,cursor:"pointer",borderRadius:999,lineHeight:"20px",fontWeight:600,
            background:view==="diffs"?"#0969da":"#f6f8fa",
            color:view==="diffs"?"#fff":"#24292f",
            border:view==="diffs"?"1px solid rgba(27,31,36,.15)":"1px solid rgba(27,31,36,.15)",
            boxShadow:view==="diffs"?"none":"0 1px 0 rgba(27,31,36,.04)",
          }}>Diffs</button>
          <button data-btn="striffs" onClick={toggle} style={{
            display:"flex",alignItems:"center",gap:5,
            padding:"5px 14px",fontSize:12,fontFamily:ff,cursor:"pointer",borderRadius:999,lineHeight:"20px",fontWeight:600,
            background:view==="striffs"?"#dafbe1":"#f6f8fa",
            color:view==="striffs"?"#1a7f37":"#24292f",
            border:view==="striffs"?"1px solid rgba(27,31,36,.15)":"1px solid rgba(27,31,36,.15)",
            boxShadow:"0 1px 0 rgba(27,31,36,.04)",
          }}>
            {view==="striffs"&&<svg width="14" height="14" viewBox="0 0 16 16" fill="#1a7f37"><path d="M8 16A8 8 0 108 0a8 8 0 000 16zm3.78-9.72a.751.751 0 01-.018 1.042L7.75 11.28a.749.749 0 01-1.06 0L4.72 9.28a.751.751 0 011.06-1.06L7.25 9.94l3.72-3.72a.749.749 0 011.06 0z"/></svg>}
            Striffs
          </button>
          <div style={{flex:1}}/>
          {/* Diff stats */}
          <span style={{fontSize:12,color:"#636c76",display:"flex",alignItems:"center",gap:6}}>
            <span style={{color:"#1a7f37",fontWeight:600}}>+{totalAdd}</span>
            <span style={{color:"#cf222e",fontWeight:600}}>-{totalDel}</span>
            {/* Mini diff bar */}
            <span style={{display:"flex",gap:1}}>
              {Array.from({length:5}).map((_,i)=>{
                const ratio=totalAdd/(totalAdd+totalDel);
                return <span key={i} style={{width:8,height:8,borderRadius:1,background:i/5<ratio?"#1a7f37":"#cf222e"}}/>
              })}
            </span>
          </span>
          <button style={{background:"#1f883d",color:"#fff",border:"1px solid rgba(27,31,36,.15)",borderRadius:6,padding:"5px 16px",fontSize:12,fontWeight:600,fontFamily:ff,cursor:"pointer",lineHeight:"20px",boxShadow:"0 1px 0 rgba(27,31,36,.04)"}}>
            Review changes
          </button>
        </div>

        {/* Content */}
        <div style={{display:"flex",height:408}}>
          {/* Sidebar */}
          <div style={{width:214,borderRight:"1px solid #d0d7de",overflowY:"auto",flexShrink:0,background:"#fbfcfe"}}>
            <div style={{padding:"8px 12px",borderBottom:"1px solid #eaeef2"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,border:"1px solid #d0d7de",borderRadius:6,padding:"5px 10px",color:"#8b949e",fontSize:12,background:"#f6f8fa"}}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M10.68 11.74a6 6 0 01-7.922-8.982 6 6 0 018.982 7.922l3.04 3.04a.749.749 0 01-.326 1.275.749.749 0 01-.734-.215zM11.5 7a4.5 4.5 0 10-9 0 4.5 4.5 0 009 0z"/></svg>
                Filter changed files
              </div>
            </div>
            {tree.map(g=>(
              <div key={g.dir}>
                <div style={{padding:"6px 12px",display:"flex",alignItems:"center",gap:6}}>
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="#636c76" style={{flexShrink:0}}><path d="M0 0l5 6 5-6z"/></svg>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="#54aeff" style={{flexShrink:0}}><path d="M.513 1.513A1.75 1.75 0 011.75 1h3.5c.55 0 1.07.26 1.4.7l.9 1.2a.25.25 0 00.2.1h6.5A1.75 1.75 0 0116 4.75v8.5A1.75 1.75 0 0114.25 15H1.75A1.75 1.75 0 010 13.25V2.75c0-.464.184-.91.513-1.237z"/></svg>
                  <span style={{fontSize:13,color:"#1f2328",fontWeight:600}}>{g.dir}</span>
                </div>
                {g.files.map(f=>(
                  <FileItem key={f.name} name={f.name} dataN={f.name} active={activeFile===f.name} onClick={()=>clickFile(f)}/>
                ))}
              </div>
            ))}
          </div>

          {/* Main */}
          <div style={{flex:1,position:"relative",overflow:"hidden"}}>
            {loading&&<Loader/>}
            <div ref={diffR} style={{position:"absolute",inset:0,overflow:"auto",opacity:view==="diffs"?1:0,transition:"opacity .2s",pointerEvents:view==="diffs"?"auto":"none",background:"#fff"}}>
              {allDiffs.map(d=><DB key={d.name} d={d} id={"d-"+d.name} focusRange={activeEntity&&entityFocus[activeEntity]?.file===d.name?entityFocus[activeEntity]:null}/>)}
            </div>
	            <div
	              ref={stageR}
	              onPointerDown={pointerDown}
	              onPointerMove={pointerMove}
	              onPointerUp={pointerUp}
	              onPointerLeave={pointerUp}
	              style={{position:"absolute",inset:0,overflow:"hidden",background:"radial-gradient(circle at 28% 20%, rgba(255,255,255,.96), rgba(243,247,253,.88) 38%, rgba(237,242,248,.95) 100%)",opacity:view==="striffs"?1:0,transition:"opacity .2s",pointerEvents:view==="striffs"?"auto":"none",touchAction:"none",cursor:dragRef.current?"grabbing":"grab"}}
	            >
	              <div style={{position:"absolute",top:14,left:16,zIndex:20,display:"flex",alignItems:"center",gap:8,padding:"7px 11px",borderRadius:999,background:"rgba(255,255,255,.84)",backdropFilter:"blur(12px)",border:"1px solid rgba(203,213,225,.8)",boxShadow:"0 8px 24px rgba(15,23,42,.06)",fontSize:11,color:"#475569",fontWeight:600,letterSpacing:".01em"}}>
	                <span style={{display:"inline-flex",width:7,height:7,borderRadius:"50%",background:"#10b981",boxShadow:"0 0 0 4px rgba(16,185,129,.12)"}}/>
	                Drag to pan • Scroll to zoom • Click a component for its code diff
	              </div>
	              <div style={{position:"absolute",top:12,right:14,zIndex:20,display:"flex",alignItems:"center",gap:8}}>
	                <button
	                  type="button"
	                  onClick={(e)=>{e.stopPropagation(); fitAll();}}
	                  style={{padding:"6px 10px",borderRadius:999,background:"rgba(255,255,255,.86)",backdropFilter:"blur(12px)",border:"1px solid rgba(203,213,225,.85)",boxShadow:"0 8px 24px rgba(15,23,42,.06)",fontSize:11,color:"#0f172a",fontWeight:700,cursor:"pointer"}}
	                >
	                  Fit
	                </button>
	                <button
	                  type="button"
	                  onClick={(e)=>{e.stopPropagation(); replayDemo();}}
	                  style={{padding:"6px 10px",borderRadius:999,background:"rgba(255,255,255,.86)",backdropFilter:"blur(12px)",border:"1px solid rgba(203,213,225,.85)",boxShadow:"0 8px 24px rgba(15,23,42,.06)",fontSize:11,color:"#0f172a",fontWeight:700,cursor:"pointer"}}
	                >
	                  Replay demo
	                </button>
	                <button
	                  type="button"
	                  onClick={(e)=>{
	                    e.stopPropagation();
	                    setActiveEntity(null);
		                    setActiveFile(null);
		                    setEnts([]);
		                    setView("diffs");
		                    diffR.current?.scrollTo({top:0,behavior:"smooth"});
		                  }}
	                  style={{padding:"6px 10px",borderRadius:999,background:"rgba(255,255,255,.86)",backdropFilter:"blur(12px)",border:"1px solid rgba(203,213,225,.85)",boxShadow:"0 8px 24px rgba(15,23,42,.06)",fontSize:11,color:"#334155",fontWeight:700,cursor:"pointer"}}
	                >
	                  Start over
	                </button>
	              </div>
	              <div style={{position:"absolute",right:16,bottom:14,zIndex:20,display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:12,background:"rgba(255,255,255,.8)",backdropFilter:"blur(12px)",border:"1px solid rgba(203,213,225,.75)",boxShadow:"0 10px 24px rgba(15,23,42,.06)",fontSize:11,color:"#334155",fontWeight:600}}>
	                <span style={{color:"#0f766e"}}>Focused file:</span>
	                <span>{activeFile??"All changed files"}</span>
	              </div>
	              <div
	                ref={svgR}
	                onClick={svgClick}
	                style={{
	                  position:"absolute",
	                  left:0,
	                  top:0,
	                  width: SVG_CONTENT_BOUNDS.width,
	                  height: SVG_CONTENT_BOUNDS.height,
	                  cursor:"pointer",
	                  transformOrigin:"0 0",
	                  transition:"transform 420ms cubic-bezier(.22,1,.36,1)",
	                  // Snap translation to whole pixels to reduce text shimmer/blur during motion.
	                  transform:`translate(${Math.round(svgTransform.x)}px,${Math.round(svgTransform.y)}px) scale(${Number(svgTransform.scale.toFixed(3))})`,
	                  willChange:"transform"
	                }}
	                dangerouslySetInnerHTML={{__html:SVG}}
	              />
            </div>
          </div>
        </div>
      </div>

      <style>{`
        *{box-sizing:border-box;margin:0}button{outline:none}
        @keyframes ring{0%{transform:scale(1);opacity:1}100%{transform:scale(2.6);opacity:0}}
        @keyframes spin{to{transform:rotate(360deg)}}
	        @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
	        code{font-family:${mono}}
	        /* The SVG has explicit pixel width/height; avoid CSS overriding it. */
	      `}</style>
	    </div>
	  );
	}
