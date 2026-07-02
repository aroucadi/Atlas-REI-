export const config = {
  get isTest() {
    return process.env.NODE_ENV === 'test';
  },
  get isProduction() {
    return (
      process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'prod'
    );
  },
};
