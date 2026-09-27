// Read only the observed classic Windows calculator AX fields. No arithmetic,
// guessed expression, or completion inferred from a successful key receipt.
export function calculatorObservation(snapshot) {
  if (typeof snapshot!=='string') throw Error('INVALID_CALCULATOR_OBSERVATION');
  const lines=snapshot.split('\n').filter(line=>!line.startsWith('The focused UI element is '));
  const field=id=>{
    const rows=lines.filter(line=>new RegExp(`^\\s*\\d+ (?:文本|text) .* ID: ${id}\\s*$`,'i').test(line));
    const value=rows.length===1?rows[0].match(/\bValue: (.*?) ID: \d+\s*$/)?.[1]??null:null;
    return {value:value!==null&&value.length<=256&&/^[\d\s.,+−\-*/×÷=()%]+$/.test(value)?value:null,ambiguous:rows.length>1};
  };
  const result=field(150),expression=field(404);
  return {result:result.value,expression:expression.value,ambiguous:result.ambiguous||expression.ambiguous};
}
