import { forwardRef, type InputHTMLAttributes } from 'react';

interface Props
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value: string;
  onChange: (v: string) => void;
}

// <input type="date"> の薄いラッパ。
// 以前は wrap div + ::before で 「年 / 月 / 日」 placeholder を被せていたが、
// その overlay があると Chrome/Safari で native カレンダー picker が
// 開いた直後に閉じる症状が出るため、ネイティブの placeholder に戻している。
// (ブラウザ依存で表示は yyyy/mm/dd だったり 年/月/日 だったりするが、picker
// の信頼性を優先)
export const DateInput = forwardRef<HTMLInputElement, Props>(function DateInput(
  { value, onChange, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  );
});
