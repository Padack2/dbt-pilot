-- 최초 1회 실행 (Neon SQL Editor, admin 권한). 최소 권한 원칙: 배치 롤 / 읽기 전용 롤 분리.

create role batch_user with login password 'CHANGE_ME';
create role readonly_user with login password 'CHANGE_ME';

grant usage, create on schema public to batch_user;
grant usage on schema public to readonly_user;

-- 이미 존재하는 테이블(raw_events 등)에 대한 권한
grant select, insert, update, delete on all tables in schema public to batch_user;
grant select on all tables in schema public to readonly_user;

-- batch_user(dbt 실행 계정)가 이후에 생성하는 테이블/MV에도 readonly_user에게 자동으로 SELECT 부여
alter default privileges for role batch_user in schema public grant select on tables to readonly_user;
