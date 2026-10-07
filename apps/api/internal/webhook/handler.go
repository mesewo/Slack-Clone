package webhook

import (
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mesewo/slack-clone/apps/api/internal/database"
)

type Authorizer func(http.ResponseWriter, *http.Request, uuid.UUID) bool

type Handler struct {
	Queries   *database.Queries
	Authorize Authorizer
}

type webhookRequest struct {
	URL    string `json:"url"`
	Secret string `json:"secret"`
}

type webhookResponse struct {
	ID          uuid.UUID `json:"id"`
	WorkspaceID uuid.UUID `json:"workspace_id"`
	URL         string    `json:"url"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

var lookupWebhookIP = net.LookupIP

func toWebhookResponse(item database.WorkspaceWebhook) webhookResponse {
	return webhookResponse{
		ID:          item.ID,
		WorkspaceID: item.WorkspaceID,
		URL:         item.Url,
		CreatedAt:   item.CreatedAt,
		UpdatedAt:   item.UpdatedAt,
	}
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := h.authorize(w, r)
	if !ok {
		return
	}
	items, err := h.Queries.ListWorkspaceWebhooks(r.Context(), workspaceID)
	if err != nil {
		writeWebhookError(w, http.StatusInternalServerError, "failed to list webhooks")
		return
	}
	responses := make([]webhookResponse, 0, len(items))
	for _, item := range items {
		responses = append(responses, toWebhookResponse(item))
	}
	writeWebhookJSON(w, http.StatusOK, responses)
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := h.authorize(w, r)
	if !ok {
		return
	}
	var request webhookRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil || !validWebhookURL(request.URL) || strings.TrimSpace(request.Secret) == "" {
		writeWebhookError(w, http.StatusBadRequest, "url and secret are required; url must use http or https")
		return
	}
	item, err := h.Queries.CreateWorkspaceWebhook(r.Context(), database.CreateWorkspaceWebhookParams{
		WorkspaceID: workspaceID,
		Url:         request.URL,
		Secret:      request.Secret,
	})
	if err != nil {
		writeWebhookError(w, http.StatusInternalServerError, "failed to create webhook")
		return
	}
	writeWebhookJSON(w, http.StatusCreated, toWebhookResponse(item))
}

func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := h.authorize(w, r)
	if !ok {
		return
	}
	webhookID, err := uuid.Parse(chi.URLParam(r, "webhookID"))
	if err != nil {
		writeWebhookError(w, http.StatusBadRequest, "invalid webhook id")
		return
	}
	var request webhookRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil || !validWebhookURL(request.URL) || strings.TrimSpace(request.Secret) == "" {
		writeWebhookError(w, http.StatusBadRequest, "url and secret are required; url must use http or https")
		return
	}
	item, err := h.Queries.UpdateWorkspaceWebhook(r.Context(), database.UpdateWorkspaceWebhookParams{
		WorkspaceID: workspaceID,
		ID:          webhookID,
		Url:         request.URL,
		Secret:      request.Secret,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		writeWebhookError(w, http.StatusNotFound, "webhook not found")
		return
	}
	if err != nil {
		writeWebhookError(w, http.StatusInternalServerError, "failed to update webhook")
		return
	}
	writeWebhookJSON(w, http.StatusOK, toWebhookResponse(item))
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := h.authorize(w, r)
	if !ok {
		return
	}
	webhookID, err := uuid.Parse(chi.URLParam(r, "webhookID"))
	if err != nil {
		writeWebhookError(w, http.StatusBadRequest, "invalid webhook id")
		return
	}
	deleted, err := h.Queries.DeleteWorkspaceWebhook(r.Context(), database.DeleteWorkspaceWebhookParams{
		WorkspaceID: workspaceID,
		ID:          webhookID,
	})
	if err != nil {
		writeWebhookError(w, http.StatusInternalServerError, "failed to delete webhook")
		return
	}
	if deleted == 0 {
		writeWebhookError(w, http.StatusNotFound, "webhook not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) authorize(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	workspaceID, err := uuid.Parse(chi.URLParam(r, "workspaceID"))
	if err != nil {
		writeWebhookError(w, http.StatusBadRequest, "invalid workspace id")
		return uuid.Nil, false
	}
	if h.Authorize == nil || !h.Authorize(w, r, workspaceID) {
		if h.Authorize == nil {
			writeWebhookError(w, http.StatusForbidden, "insufficient workspace permission")
		}
		return uuid.Nil, false
	}
	return workspaceID, true
}

func validWebhookURL(raw string) bool {
	parsed, err := url.ParseRequestURI(raw)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" || parsed.User != nil || parsed.Fragment != "" {
		return false
	}
	return !isPrivateOrLoopback(parsed.Hostname())
}

func isPrivateOrLoopback(host string) bool {
	ips, err := lookupWebhookIP(host)
	if err != nil || len(ips) == 0 {
		return true
	}
	for _, ip := range ips {
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() {
			return true
		}
	}
	return false
}

func writeWebhookJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeWebhookError(w http.ResponseWriter, status int, message string) {
	writeWebhookJSON(w, status, map[string]string{"error": message})
}
