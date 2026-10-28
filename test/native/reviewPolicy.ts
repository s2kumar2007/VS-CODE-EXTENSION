/** Guardrails for opt-in, automated live-test approvals; not production review. */
export function isScopedInlineProposal(oldText: string, newText: string): boolean {
 const normalize=(s:string)=>s.replace(/\r\n/g,'\n');
 const old=normalize(oldText), proposed=normalize(newText);
 const split=(s:string)=>{
  const start=s.indexOf('def get_debug_flag() -> bool:');
  if(start<0 || (start>0 && s[start-1]!=='\n'))return undefined;
  const end=s.indexOf('\ndef get_load_dotenv(',start);
  if(end<0)return undefined;
  return {prefix:s.slice(0,start),suffix:s.slice(end)};
 };
 const a=split(old),b=split(proposed);
 return !!a && !!b && a.prefix===b.prefix && a.suffix===b.suffix;
}
