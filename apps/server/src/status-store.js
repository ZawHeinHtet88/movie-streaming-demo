export function createStatusStore() {
  const records = new Map();

  return {
    create(id, values) {
      const now = new Date().toISOString();
      records.set(id, { id, ...values, createdAt: now, updatedAt: now });
      return this.get(id);
    },

    update(id, values) {
      const current = records.get(id);
      if (!current) return null;
      records.set(id, {
        ...current,
        ...values,
        id,
        updatedAt: new Date().toISOString()
      });
      return this.get(id);
    },

    get(id) {
      const record = records.get(id);
      return record ? { ...record } : null;
    }
  };
}
