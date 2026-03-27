import { query } from '../config/db.js';

export async function ensureBaseSchema() {
  await query(`
    create extension if not exists pgcrypto;

    create table if not exists tenants (
      id uuid primary key default gen_random_uuid(),
      name varchar(160) not null,
      slug varchar(160) unique,
      brand_name varchar(160),
      status varchar(30) not null default 'active',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    alter table tenants add column if not exists brand_name varchar(160);
    alter table tenants add column if not exists logo_url text;
    alter table tenants add column if not exists favicon_url text;
    alter table tenants add column if not exists primary_color varchar(20);
    alter table tenants add column if not exists secondary_color varchar(20);
    alter table tenants add column if not exists accent_color varchar(20);
    alter table tenants add column if not exists custom_domain varchar(255);
    alter table tenants add column if not exists support_email varchar(160);
    alter table tenants add column if not exists whatsapp_number varchar(40);
    alter table tenants add column if not exists booking_url text;

    create table if not exists tenant_users (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id) on delete cascade,
      full_name varchar(160) not null,
      email varchar(160) not null unique,
      password_hash text not null,
      role varchar(40) not null default 'owner',
      role_label varchar(120),
      phone varchar(40),
      signature text,
      notification_email boolean not null default true,
      notification_whatsapp boolean not null default false,
      mfa_enabled boolean not null default false,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );


    alter table tenant_users add column if not exists role_label varchar(120);
    alter table tenant_users add column if not exists phone varchar(40);
    alter table tenant_users add column if not exists signature text;
    alter table tenant_users add column if not exists notification_email boolean not null default true;
    alter table tenant_users add column if not exists notification_whatsapp boolean not null default false;
    alter table tenant_users add column if not exists mfa_enabled boolean not null default false;

    create table if not exists tenant_settings (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null unique references tenants(id) on delete cascade,
      meta_title varchar(160),
      meta_description text,
      login_title varchar(160),
      login_subtitle text,
      sidebar_title varchar(160),
      sidebar_subtitle varchar(160),
      surface_mode varchar(20) not null default 'light',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    alter table tenant_settings add column if not exists meta_title varchar(160);
    alter table tenant_settings add column if not exists meta_description text;
    alter table tenant_settings add column if not exists login_title varchar(160);
    alter table tenant_settings add column if not exists login_subtitle text;
    alter table tenant_settings add column if not exists sidebar_title varchar(160);
    alter table tenant_settings add column if not exists sidebar_subtitle varchar(160);
    alter table tenant_settings add column if not exists surface_mode varchar(20) not null default 'light';

    create index if not exists idx_tenant_users_tenant_id on tenant_users(tenant_id);
    create index if not exists idx_tenants_status on tenants(status);
    create index if not exists idx_tenant_settings_tenant_id on tenant_settings(tenant_id);
  `);
}
