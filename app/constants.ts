export const DEFAULT_SQL = `create table user
(
    id  bigint primary key,
    ame varchar(100)
);

create table content
(
    id         bigint primary key,
    author_id  bigint,
    title      varchar(100),
    created_at timestamp,
    constraint fk_author foreign key (author_id) references user (id)
);

create table view
(
    id             bigint primary key,
    content_id     bigint,
    user_id        bigint,
    total_sec_view int,
    created_at     timestamp,
    constraint fk_content foreign key (content_id) references content (id),
    constraint fk_user foreign key (user_id) references user (id)
);
`;
