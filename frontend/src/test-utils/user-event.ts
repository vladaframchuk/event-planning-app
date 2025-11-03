import { fireEvent } from '@testing-library/react';

type SelectElement = HTMLSelectElement;

const selectOptions = async (element: Element, values: string | string[]) => {
  const target = element as SelectElement;
  const optionValues = Array.isArray(values) ? values : [values];

  optionValues.forEach((value) => {
    fireEvent.change(target, { target: { value } });
  });

  await Promise.resolve();
};

const userEvent = {
  selectOptions,
};

export default userEvent;
