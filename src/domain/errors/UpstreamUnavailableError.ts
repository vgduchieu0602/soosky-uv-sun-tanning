export { UpstreamUnavailableError as default };

class UpstreamUnavailableError extends Error {
    public constructor (message = "Weather provider is unavailable.") {
        super(message);
        this.name = "UpstreamUnavailableError";
    }
}
