from __future__ import annotations

from collections import defaultdict
from typing import Any

from rest_framework import serializers

from apps.polls.models import Poll, PollOption


class PollOptionSerializer(serializers.ModelSerializer):
    votes_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = PollOption
        fields = ["id", "label", "date_value", "votes_count"]
        read_only_fields = ["id", "votes_count"]


class PollOptionCreateSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=200, required=False, allow_blank=False)
    date_value = serializers.DateField(required=False)


class PollCreateSerializer(serializers.ModelSerializer):
    options = PollOptionCreateSerializer(many=True, write_only=True)

    class Meta:
        model = Poll
        fields = [
            "type",
            "question",
            "multiple",
            "allow_change_vote",
            "end_at",
            "options",
        ]
        extra_kwargs = {
            "multiple": {"default": False, "required": False},
            "allow_change_vote": {"default": True, "required": False},
            "end_at": {"required": False, "allow_null": True},
        }

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        poll_type: str = attrs.get("type", "")
        options_input: list[dict[str, Any]] = attrs.get("options", [])

        if len(options_input) < 2:
            raise serializers.ValidationError({"options": ["Нужно указать минимум два варианта."]})

        normalized_options: list[dict[str, Any]] = []

        if poll_type == Poll.Type.DATE:
            seen_dates: set[Any] = set()
            for option in options_input:
                date_value = option.get("date_value")
                if date_value is None:
                    raise serializers.ValidationError({"options": ["Для типа date все варианты должны содержать date_value."]})
                if date_value in seen_dates:
                    raise serializers.ValidationError({"options": ["Все даты должны быть уникальными."]})
                seen_dates.add(date_value)
                normalized_options.append({"date_value": date_value})
        elif poll_type in {Poll.Type.PLACE, Poll.Type.CUSTOM}:
            seen_labels: set[str] = set()
            for option in options_input:
                label = option.get("label")
                if label is None:
                    raise serializers.ValidationError({"options": ["Для этого типа необходимо заполнить label."]})
                cleaned_label = label.strip()
                if not cleaned_label:
                    raise serializers.ValidationError({"options": ["Пустые варианты недоступны."]})
                if cleaned_label in seen_labels:
                    raise serializers.ValidationError({"options": ["Варианты должны быть уникальными."]})
                seen_labels.add(cleaned_label)
                normalized_options.append({"label": cleaned_label})
        else:
            raise serializers.ValidationError({"type": ["Недопустимый тип опроса."]})

        attrs["options"] = normalized_options
        return attrs

    def create(self, validated_data: dict[str, Any]) -> Poll:
        options_data = validated_data.pop("options")
        event = self.context.get("event")
        request = self.context.get("request")
        if event is None or request is None:
            raise RuntimeError("Serializer context must include event and request.")

        poll = Poll.objects.create(
            event=event,
            created_by=request.user,
            **validated_data,
        )
        poll_options = [PollOption(poll=poll, **option_data) for option_data in options_data]
        PollOption.objects.bulk_create(poll_options)
        return poll


class PollReadSerializer(serializers.ModelSerializer):
    event = serializers.IntegerField(source="event_id", read_only=True)
    options = PollOptionSerializer(many=True, read_only=True)
    total_votes = serializers.SerializerMethodField()
    my_votes = serializers.SerializerMethodField()
    leader_option_ids = serializers.SerializerMethodField()

    class Meta:
        model = Poll
        fields = [
            "id",
            "event",
            "type",
            "question",
            "multiple",
            "allow_change_vote",
            "is_closed",
            "end_at",
            "created_at",
            "options",
            "total_votes",
            "my_votes",
            "leader_option_ids",
        ]
        read_only_fields = [
            "id",
            "event",
            "created_at",
            "options",
            "total_votes",
            "my_votes",
            "leader_option_ids",
        ]

    def _get_vote_map(self) -> dict[int, list[int]]:
        vote_map = self.context.get("user_votes_map")
        if vote_map is None:
            return defaultdict(list)
        return vote_map

    def _get_prefetched_options(self, obj: Poll) -> list[PollOption]:
        cache = getattr(obj, "_prefetched_objects_cache", None)
        if cache and "options" in cache:
            return list(cache["options"])
        return list(obj.options.all())

    def get_total_votes(self, obj: Poll) -> int:
        annotated_total = getattr(obj, "total_votes", None)
        if annotated_total is not None:
            return int(annotated_total)
        option_votes = [int(getattr(option, "votes_count", 0) or 0) for option in self._get_prefetched_options(obj)]
        return int(sum(option_votes))

    def get_my_votes(self, obj: Poll) -> list[int]:
        vote_map = self._get_vote_map()
        return vote_map.get(obj.id, [])

    def get_leader_option_ids(self, obj: Poll) -> list[int]:
        options_iterable = self._get_prefetched_options(obj)
        if not options_iterable:
            return []
        max_votes = 0
        leaders: list[int] = []
        for option in options_iterable:
            votes = int(getattr(option, "votes_count", 0) or 0)
            if votes == 0:
                continue
            if votes > max_votes:
                max_votes = votes
                leaders = [option.id]
            elif votes == max_votes:
                leaders.append(option.id)
        return leaders


class PollListItemSerializer(PollReadSerializer):
    class Meta(PollReadSerializer.Meta):
        fields = PollReadSerializer.Meta.fields
