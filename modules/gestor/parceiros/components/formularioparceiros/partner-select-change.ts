import type { ChangeEvent } from 'react';

// Preserve the existing form handlers while a combobox supplies only its canonical value.
export const partnerSelectChange = (
  name: string,
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void,
) => (value: string) => {
  const target = { name, value, type: 'select-one', tagName: 'SELECT' } as HTMLSelectElement;
  onChange({ target, currentTarget: target } as ChangeEvent<HTMLSelectElement>);
};
