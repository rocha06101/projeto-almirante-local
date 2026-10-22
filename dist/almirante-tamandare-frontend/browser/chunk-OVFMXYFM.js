var o=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;function l(t){let r=String(t.value??"").trim();return r?o.test(r)?null:{emailFormat:!0}:null}export{l as a};
