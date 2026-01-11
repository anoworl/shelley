-- name: GetSettings :one
SELECT data FROM settings WHERE id = 1;

-- name: UpdateSettings :exec
UPDATE settings SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1;
