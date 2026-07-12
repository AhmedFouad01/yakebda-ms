import { Knex } from "knex";

/**
 * Order integrity stabilization:
 * - replaces the legacy branch/order number uniqueness rule with an explicit numbering scope key;
 * - assigns order numbers atomically for branch/account and daily/continuous scopes;
 * - validates variants and modifier selections at transaction commit.
 */
export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable("orders", (t) => {
    t.string("numbering_key", 180).nullable();
  });

  await db("orders").update({ numbering_key: db.raw("'legacy:' || id::text") });

  await db.schema.alterTable("orders", (t) => {
    t.string("numbering_key", 180).notNullable().alter();
  });

  await db.raw("ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_branch_id_order_no_unique");
  await db.raw(
    "ALTER TABLE orders ADD CONSTRAINT orders_numbering_key_order_no_unique UNIQUE (numbering_key, order_no)"
  );

  await db.raw(`
    CREATE OR REPLACE FUNCTION ykms_assign_order_number()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      v_branch_specific boolean := true;
      v_daily_reset boolean := false;
      v_starting_number integer := 1;
      v_timezone text := 'Africa/Cairo';
      v_business_date date;
      v_scope_prefix text;
      v_numbering_key text;
      v_max integer;
    BEGIN
      SELECT COALESCE(
        (
          SELECT (s.value #>> '{}')::boolean
          FROM settings s
          WHERE s.account_id = NEW.account_id
            AND s.key = 'branch_specific_numbering'
            AND (s.branch_id IS NULL OR s.branch_id = NEW.branch_id)
          ORDER BY (s.branch_id IS NOT NULL) DESC
          LIMIT 1
        ),
        true
      ) INTO v_branch_specific;

      SELECT COALESCE(
        (
          SELECT (s.value #>> '{}')::boolean
          FROM settings s
          WHERE s.account_id = NEW.account_id
            AND s.key = 'order_daily_reset'
            AND (s.branch_id IS NULL OR s.branch_id = NEW.branch_id)
          ORDER BY (s.branch_id IS NOT NULL) DESC
          LIMIT 1
        ),
        false
      ) INTO v_daily_reset;

      SELECT COALESCE(
        (
          SELECT (s.value #>> '{}')::integer
          FROM settings s
          WHERE s.account_id = NEW.account_id
            AND s.key = 'order_starting_number'
            AND (s.branch_id IS NULL OR s.branch_id = NEW.branch_id)
          ORDER BY (s.branch_id IS NOT NULL) DESC
          LIMIT 1
        ),
        1
      ) INTO v_starting_number;

      SELECT COALESCE(b.timezone, 'Africa/Cairo')
      INTO v_timezone
      FROM branches b
      WHERE b.id = NEW.branch_id;

      v_business_date := timezone(v_timezone, CURRENT_TIMESTAMP)::date;
      v_scope_prefix := CASE
        WHEN v_branch_specific THEN 'branch:' || NEW.branch_id::text
        ELSE 'account:' || NEW.account_id::text
      END;
      v_numbering_key := v_scope_prefix || CASE
        WHEN v_daily_reset THEN ':day:' || v_business_date::text
        ELSE ':continuous'
      END;

      -- Serialize one numbering scope. Under READ COMMITTED, the MAX query below
      -- runs after lock acquisition and sees the latest committed order.
      PERFORM pg_advisory_xact_lock(hashtextextended(v_numbering_key, 0));

      IF v_branch_specific THEN
        SELECT max(o.order_no)
        INTO v_max
        FROM orders o
        WHERE o.branch_id = NEW.branch_id
          AND (
            NOT v_daily_reset
            OR timezone(v_timezone, o.created_at)::date = v_business_date
          );
      ELSE
        SELECT max(o.order_no)
        INTO v_max
        FROM orders o
        WHERE o.account_id = NEW.account_id
          AND (
            NOT v_daily_reset
            OR timezone(v_timezone, o.created_at)::date = v_business_date
          );
      END IF;

      NEW.numbering_key := v_numbering_key;
      NEW.order_no := GREATEST(COALESCE(v_max + 1, v_starting_number), v_starting_number);
      RETURN NEW;
    END;
    $$;
  `);

  await db.raw(`
    CREATE TRIGGER orders_assign_number_before_insert
    BEFORE INSERT ON orders
    FOR EACH ROW
    EXECUTE FUNCTION ykms_assign_order_number();
  `);

  await db.raw(`
    CREATE OR REPLACE FUNCTION ykms_validate_order_item_configuration()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      v_item_id uuid;
      v_product_id uuid;
      v_variant_id uuid;
      v_group record;
      v_selected integer;
      v_required_min integer;
    BEGIN
      IF TG_TABLE_NAME = 'order_items' THEN
        v_item_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
      ELSE
        v_item_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.order_item_id ELSE NEW.order_item_id END;
      END IF;

      SELECT oi.product_id, oi.variant_id
      INTO v_product_id, v_variant_id
      FROM order_items oi
      WHERE oi.id = v_item_id;

      IF v_product_id IS NULL THEN
        RETURN NULL;
      END IF;

      IF v_variant_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM product_variants pv
        WHERE pv.id = v_variant_id
          AND pv.product_id = v_product_id
          AND pv.is_active = true
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          CONSTRAINT = 'order_item_variant_product_check',
          MESSAGE = 'Selected variant does not belong to the ordered product';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM order_item_modifiers oim
        WHERE oim.order_item_id = v_item_id
        GROUP BY oim.modifier_id
        HAVING count(*) > 1
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          CONSTRAINT = 'order_item_modifier_duplicate_check',
          MESSAGE = 'The same modifier cannot be selected more than once';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM order_item_modifiers oim
        JOIN modifiers m ON m.id = oim.modifier_id
        JOIN modifier_groups mg ON mg.id = m.modifier_group_id
        WHERE oim.order_item_id = v_item_id
          AND (
            m.is_active = false
            OR mg.is_active = false
            OR NOT EXISTS (
              SELECT 1
              FROM product_modifier_groups pmg
              WHERE pmg.product_id = v_product_id
                AND pmg.modifier_group_id = mg.id
            )
          )
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          CONSTRAINT = 'order_item_modifier_product_check',
          MESSAGE = 'Selected modifier does not belong to the ordered product';
      END IF;

      FOR v_group IN
        SELECT mg.id, mg.min_select, mg.max_select, mg.is_required
        FROM product_modifier_groups pmg
        JOIN modifier_groups mg ON mg.id = pmg.modifier_group_id
        WHERE pmg.product_id = v_product_id
          AND mg.is_active = true
      LOOP
        SELECT count(*)::integer
        INTO v_selected
        FROM order_item_modifiers oim
        JOIN modifiers m ON m.id = oim.modifier_id
        WHERE oim.order_item_id = v_item_id
          AND m.modifier_group_id = v_group.id;

        v_required_min := GREATEST(v_group.min_select, CASE WHEN v_group.is_required THEN 1 ELSE 0 END);

        IF v_selected < v_required_min THEN
          RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'order_item_modifier_min_select_check',
            MESSAGE = 'Required modifier selections are missing';
        END IF;

        IF v_selected > v_group.max_select THEN
          RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'order_item_modifier_max_select_check',
            MESSAGE = 'Too many modifiers were selected from one group';
        END IF;
      END LOOP;

      RETURN NULL;
    END;
    $$;
  `);

  await db.raw(`
    CREATE CONSTRAINT TRIGGER order_items_configuration_check
    AFTER INSERT OR UPDATE ON order_items
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION ykms_validate_order_item_configuration();
  `);

  await db.raw(`
    CREATE CONSTRAINT TRIGGER order_item_modifiers_configuration_check
    AFTER INSERT OR UPDATE OR DELETE ON order_item_modifiers
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION ykms_validate_order_item_configuration();
  `);
}

export async function down(db: Knex): Promise<void> {
  await db.raw("DROP TRIGGER IF EXISTS order_item_modifiers_configuration_check ON order_item_modifiers");
  await db.raw("DROP TRIGGER IF EXISTS order_items_configuration_check ON order_items");
  await db.raw("DROP FUNCTION IF EXISTS ykms_validate_order_item_configuration()");
  await db.raw("DROP TRIGGER IF EXISTS orders_assign_number_before_insert ON orders");
  await db.raw("DROP FUNCTION IF EXISTS ykms_assign_order_number()");

  await db.raw("ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_numbering_key_order_no_unique");
  await db.schema.alterTable("orders", (t) => {
    t.dropColumn("numbering_key");
  });

  await db.raw(`
    WITH ranked AS (
      SELECT
        id,
        branch_id,
        created_at,
        row_number() OVER (
          PARTITION BY branch_id, order_no
          ORDER BY created_at, id
        ) AS duplicate_rank
      FROM orders
    ),
    duplicates AS (
      SELECT
        r.id,
        r.branch_id,
        row_number() OVER (
          PARTITION BY r.branch_id
          ORDER BY r.created_at, r.id
        ) AS sequence_no
      FROM ranked r
      WHERE r.duplicate_rank > 1
    ),
    branch_max AS (
      SELECT branch_id, max(order_no) AS max_order_no
      FROM orders
      GROUP BY branch_id
    )
    UPDATE orders o
    SET order_no = bm.max_order_no + d.sequence_no
    FROM duplicates d
    JOIN branch_max bm ON bm.branch_id = d.branch_id
    WHERE o.id = d.id;
  `);

  await db.raw("ALTER TABLE orders ADD CONSTRAINT orders_branch_id_order_no_unique UNIQUE (branch_id, order_no)");
}
