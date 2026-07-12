import { randomUUID } from 'node:crypto';
import { CustomerStatuses } from './customer-intake-mission-control-contracts.js';
import { loadRecordMap, upsertRecord } from '../storage/provider-backed-state.js';

function isoNow(nowFn) {
  return nowFn?.() ?? new Date().toISOString();
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

export class CustomerRegistry {
  constructor({ now, storageProvider, namespace = 'executive.customer-registry' } = {}) {
    this.now = now;
    this.storageProvider = storageProvider ?? null;
    this.namespace = namespace;
    this.customers = loadRecordMap({ provider: this.storageProvider, namespace: this.namespace });
  }

  listCustomers() {
    return Array.from(this.customers.values())
      .sort((a, b) => String(a.createdDate).localeCompare(String(b.createdDate)));
  }

  getCustomerById(customerId) {
    return this.customers.get(customerId) ?? null;
  }

  findDuplicate({ companyName, email, website } = {}) {
    const normalizedCompany = normalize(companyName);
    const normalizedEmail = normalize(email);
    const normalizedWebsite = normalize(website);

    for (const customer of this.customers.values()) {
      const sameWebsite = normalizedWebsite.length > 0 && normalize(customer.website) === normalizedWebsite;
      const sameEmail = normalizedEmail.length > 0 && normalize(customer.email) === normalizedEmail;
      const sameCompany = normalizedCompany.length > 0 && normalize(customer.companyName) === normalizedCompany;

      if ((sameWebsite && sameCompany) || (sameEmail && sameCompany)) {
        return customer;
      }
    }

    return null;
  }

  createCustomer({
    companyName,
    contactName,
    email,
    phone,
    website,
    industry,
    status = CustomerStatuses.ACTIVE
  } = {}) {
    const duplicate = this.findDuplicate({ companyName, email, website });
    if (duplicate) {
      return {
        customer: duplicate,
        duplicateDetected: true
      };
    }

    const timestamp = isoNow(this.now);
    const customer = {
      customerId: `cus_${randomUUID()}`,
      companyName,
      contactName,
      email,
      phone,
      website,
      industry,
      status,
      createdDate: timestamp,
      lastUpdated: timestamp
    };

    this.customers.set(customer.customerId, customer);
    upsertRecord({ provider: this.storageProvider, namespace: this.namespace, key: customer.customerId, value: customer });

    return {
      customer,
      duplicateDetected: false
    };
  }

  updateCustomer(customerId, patch = {}) {
    const current = this.getCustomerById(customerId);
    if (!current) {
      return null;
    }

    const updated = {
      ...current,
      ...patch,
      lastUpdated: isoNow(this.now)
    };

    this.customers.set(customerId, updated);
    upsertRecord({ provider: this.storageProvider, namespace: this.namespace, key: customerId, value: updated });
    return updated;
  }
}
