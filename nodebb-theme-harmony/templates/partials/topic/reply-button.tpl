{{{ if privileges.topics:reply }}}
<div component="topic/reply/container" class="btn-group">
	<a href="{config.relative_path}/compose?tid={tid}" class="d-flex align-items-center btn btn-sm btn-primary px-3 fw-semibold" component="topic/reply" data-ajaxify="false" role="button"><i class="fa fa-reply d-sm-block d-md-none"></i><span class="d-none d-md-block"> [[topic:reply]]</span></a>
</div>
{{{ end }}}

{{{ if loggedIn }}}
	{{{ if !privileges.topics:reply }}}
		{{{ if locked }}}
		<a href="#" component="topic/reply/locked" class="d-flex gap-2 align-items-center fw-semibold btn btn-sm btn-primary disabled" disabled><i class="fa fa-lock"></i> [[topic:locked]]</a>
		{{{ end }}}
	{{{ end }}}

	{{{ if !locked }}}
	<a href="#" component="topic/reply/locked" class="d-flex gap-2 align-items-center fw-semibold btn btn-sm btn-primary disabled hidden" disabled><i class="fa fa-lock"></i> [[topic:locked]]</a>
	{{{ end }}}
{{{ else }}}
	{{{ if !privileges.topics:reply }}}
	<a component="topic/reply/guest" href="{config.relative_path}/login" class="d-flex align-items-center fw-semibold btn btn-sm btn-primary">[[topic:guest-login-reply]]</a>
	{{{ end }}}
{{{ end }}}