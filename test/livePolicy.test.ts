import {it,expect} from 'vitest';
import {isScopedInlineProposal} from './native/reviewPolicy';
const source='import os\n\ndef get_debug_flag() -> bool:\n    return False\n\ndef get_load_dotenv(default=True):\n    return default\n';
it('allows only the selected inline function to change, including CRLF',()=>{
 const proposal=source.replace('return False','return True');
 expect(isScopedInlineProposal(source,proposal)).toBe(true);
 expect(isScopedInlineProposal(source.replaceAll('\n','\r\n'),proposal)).toBe(true);
 expect(isScopedInlineProposal(source,proposal.replace('import os','import sys'))).toBe(false);
 expect(isScopedInlineProposal(source,proposal.replace('return default','return False'))).toBe(false);
});
it('rejects incomplete or renamed inline proposals',()=>{
 expect(isScopedInlineProposal(source,'def get_debug_flag() -> bool:\n    return True')).toBe(false);
 expect(isScopedInlineProposal(source,source.replace('get_debug_flag','other'))).toBe(false);
});
