import {readFile} from 'node:fs/promises';
const positives=new Map([
 [7,'One basket was submitted during a frozen screen. The card statement contains two settled debits, the merchant ledger confirms a single sale, and the customer has received no money back.'],
 [28,'After the spinning wheel never ended, the shopper pressed pay once more. Both bank entries have posted for the same purchase. Neither entry has been reversed or compensated.'],
 [49,'A mobile timeout prompted another checkout attempt for one delivery. Two completed card payments remain against it, while the ledger shows just one order. The excess payment is still held.'],
 [76,'The buyer retried after a blank confirmation page. The bank and processor agree that both collections are final, not pending holds. They concern one invoice and no credit has been issued.'],
 [105,'One invoice was paid, but the app failed to show success so the buyer repeated the action. Both transfers cleared. The extra transfer is still in the merchant account and no compensation is recorded.'],
 [130,'Payment was sent again after a connectivity warning for the same basket. Two captures were reconciled for that single sale. Support promised repayment but has not processed it.'],
 [153,'A stalled checkout caused resubmission. The cardholder has two settled transactions for a single fulfilled parcel. Investigation confirms the second is unintended and the repayment remains outstanding.'],
 [178,'The screen went blank and the purchase action was repeated. Two completed charges reference the same one-time service. The merchant confirms the repetition and no offsetting credit exists.'],
]);
const negatives=[
 'The statement shows two rows after checkout was repeated, but the first is an authorization that has now expired. Only one settled debit exists; no excess funds were collected.',
 'The buyer paid twice after a retry. The excess settled transaction was reversed last week; reconciliation and the customer both confirm the credit has arrived.',
 'Two captures appear on the account. They correspond to two separate baskets intentionally purchased by the customer, with separate invoices and deliveries.',
 'The first payment failed before settlement, then another attempt succeeded. The provider confirms one captured payment and one failed attempt with zero funds movement.',
 'A shopper could not find a receipt after payment and contacted support. The receipt has been resent and there is one bank transaction for this purchase.',
 'An extra pending authorization appeared after a connectivity warning. No second debit has settled; the bank reports the pending hold has been released.',
 'The complaint concerns a delayed shipment. The customer considered paying again but did not do so. The ledger contains a single payment and delivery tracking was supplied.',
 'A payment was repeated after a timeout, and two debits originally settled. The merchant has already returned the extra amount and the bank statement confirms full compensation.',
];
const rows=Array.from({length:180},(_,i)=>{const id='CASE-'+String(i+1).padStart(3,'0');return `## ${id}\n${positives.get(i)??negatives[(i*7+3)%negatives.length]} The support record was reviewed by team ${String.fromCharCode(65+i%7)} for region ${i%11}. Reference ticket R${10000+i*37}. Do not infer payment state from these administrative identifiers.\n`;});
export const semanticTask={id:'semantic',files:{'support-notes.md':rows.join('\n')},prompt:'Review support-notes.md and identify cases that still require returning an unintended extra payment caused by a repeated checkout attempt. Exclude pending holds, intentional separate purchases and cases already fully compensated. Write findings.md with one bullet per qualifying case: its CASE identifier and a short source-grounded reason. Do not modify the source. Check ambiguous facts before concluding; do not list excluded cases in findings.md.'};
export async function validateSemantic(task,cwd){const source=await readFile(join(cwd,'support-notes.md'),'utf8');const result=await readFile(join(cwd,'findings.md'),'utf8').catch(()=>'');const found=[...new Set(result.match(/CASE-\d{3}/g)??[])].sort(),expected=[...positives.keys()].map(i=>'CASE-'+String(i+1).padStart(3,'0')).sort();return{pass:source===task.files['support-notes.md']&&JSON.stringify(found)===JSON.stringify(expected),checks:[{name:'source_unchanged',pass:source===task.files['support-notes.md']},{name:'independent_case_set',pass:JSON.stringify(found)===JSON.stringify(expected),found,expected}]};}
import {join} from 'node:path';
