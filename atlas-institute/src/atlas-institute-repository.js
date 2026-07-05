export class AtlasInstituteRepository {
  constructor() {
    this.records = [];
    this.history = [];
  }

  save(record) {
    this.records.push(record);
    this.history.push({ type: 'recorded', id: record.id, category: record.category, timestamp: new Date().toISOString() });
    return record;
  }

  search(query) {
    const text = query.text?.toLowerCase() ?? null;
    const filtered = this.records.filter((record) => {
      if (query.category && record.category !== query.category) {
        return false;
      }
      if (query.source && record.source !== query.source) {
        return false;
      }
      if (query.tag && !record.tags.includes(query.tag)) {
        return false;
      }
      if (text) {
        const haystack = `${record.title} ${record.summary} ${record.content}`.toLowerCase();
        return haystack.includes(text);
      }
      return true;
    });

    return {
      records: filtered,
      total: filtered.length,
    };
  }

  getHistory() {
    return [...this.history];
  }
}
