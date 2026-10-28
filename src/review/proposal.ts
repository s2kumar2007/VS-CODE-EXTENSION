import { normalizeEol } from './hunks';
/** Builds a candidate only; the normal review permit still controls every write. */
export function materializeWrite(existing: string | undefined, args: Record<string, unknown>): string {
 const full=args.new_content!==undefined, patches=args.edits!==undefined;
 if(full===patches)throw new Error('Provide exactly one of new_content or edits.');
 if(full){if(typeof args.new_content!=='string')throw new Error('new_content must be a string.');return args.new_content;}
 if(existing===undefined)throw new Error('Exact edits require an existing file; use new_content to create one.');
 if(!Array.isArray(args.edits)||args.edits.length===0||args.edits.length>20)throw new Error('Provide between 1 and 20 exact edits.');
 let candidate=existing;
 for(const edit of args.edits){
  if(typeof edit!=='object'||edit===null||typeof edit.old_text!=='string'||!edit.old_text||typeof edit.new_text!=='string')throw new Error('Each edit requires nonempty old_text and string new_text.');
  const needle=normalizeEol(existing,edit.old_text),replacement=normalizeEol(existing,edit.new_text);
  const first=candidate.indexOf(needle);
  if(first<0)throw new Error('Exact edit text was not found; read a current slice and try again.');
  if(candidate.indexOf(needle,first+1)>=0)throw new Error('Exact edit text matches more than once; include a larger unique anchor.');
  candidate=candidate.slice(0,first)+replacement+candidate.slice(first+needle.length);
 }
 return candidate;
}
