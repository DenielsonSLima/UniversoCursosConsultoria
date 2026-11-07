import React from 'react';
import SharedCurrencyInput from '../../../../../shared/components/CurrencyInput';

type Props = React.ComponentProps<typeof SharedCurrencyInput>;

const CurrencyInput: React.FC<Props> = (props) => <SharedCurrencyInput {...props} prefix="R$ " />;

export default CurrencyInput;
