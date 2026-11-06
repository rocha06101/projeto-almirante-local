import { apiDateToForm, formDateToApi, isValidFormDate } from './profile-form';

describe('profile form date conversion', () => {
  it('converts valid ISO calendar dates without using local timezone rules', () => {
    expect(apiDateToForm('2000-02-29')).toBe('29/02/2000');
    expect(formDateToApi('29/02/2000')).toBe('2000-02-29');
  });

  it('rejects impossible dates and preserves an empty optional value', () => {
    expect(apiDateToForm('2001-02-29')).toBe('');
    expect(formDateToApi('31/04/2001')).toBeNull();
    expect(formDateToApi('')).toBeNull();
    expect(isValidFormDate('')).toBe(true);
    expect(isValidFormDate('31/04/2001')).toBe(false);
  });
});
