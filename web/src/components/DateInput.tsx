import { forwardRef, type InputHTMLAttributes } from 'react';

interface Props
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value: string;
  onChange: (v: string) => void;
}

// type="date" の native placeholder は browser locale で決まる
// (Safari は "yyyy/mm/dd", Chrome の ja locale は "年/月/日" 等で揺らぐ)。
// 空状態だけ pseudo-element で「年 / 月 / 日」を上から被せて統一する。
export const DateInput = forwardRef<HTMLInputElement, Props>(function DateInput(
  { value, onChange, ...rest },
  ref,
) {
  return (
    <div
      className="date-input-wrap"
      data-has-value={value ? 'true' : 'false'}
    >
      <input
        ref={ref}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
    </div>
  );
});
